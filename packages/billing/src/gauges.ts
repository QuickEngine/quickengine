import { and, count, db, eq, isNull } from "@quickengine/db";
import { catalogItems } from "@quickengine/db/schema/catalog-items";
import {
	quickengineOrganizationMembers,
	quickengineSubscriptions,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { checkAllowance, type EnforceResult, meter } from "./metering";
import { billableSeats, isPerSeatPlan } from "./plans";
import { getStripe, isStripeConfigured } from "./stripe";

/**
 * The gauges that count things an organization owns.
 *
 * 🔴 Both of these were declared as plan limits and never written, so neither
 * was enforced: an account could hold any number of members or workspaces
 * regardless of tier. They are grouped here because they share one rule —
 * **recount, never adjust.** An incrementing counter drifts the first time a
 * call is missed or retried and has no way back; a recount converges on the
 * truth from any state, including a wrong one.
 */

/**
 * Keep the seat count true after a membership change.
 *
 * 🔑 Seats are the only meter with two consumers. The `seats` gauge feeds
 * limit enforcement, and on a per-seat plan the same number is what Stripe
 * bills. Writing one without the other produces either a company billed for
 * seats it does not have, or one using capacity it never paid for — so both
 * happen here, from one count, and nothing else is allowed to write either.
 *
 * Call after every membership change. It is idempotent: it recounts rather than
 * incrementing, so a double call, a retry, or a missed call followed by any
 * later one all converge on the truth.
 *
 * ⚠️ Deliberately never throws. A membership change must not fail because
 * Stripe is unreachable — the person is in the organization either way, and the
 * next change reconciles the quantity. What it must not do is silently diverge
 * forever, which is why it recounts instead of adjusting.
 */
const countMembers = async (organizationId: string): Promise<number> => {
	const [row] = await db
		.select({ total: count() })
		.from(quickengineOrganizationMembers)
		.where(eq(quickengineOrganizationMembers.organizationId, organizationId));
	return row?.total ?? 0;
};

const countWorkspaces = async (organizationId: string): Promise<number> => {
	const [row] = await db
		.select({ total: count() })
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.organizationId, organizationId),
				// 🔴 Archived workspaces do not occupy a plan slot. Without this, a
				// Free account (one workspace) that archived its only workspace —
				// the documented step before discarding it — could not create
				// another, and could not delete the archived one either. The
				// customer was stuck with no way forward.
				isNull(quickengineWorkspaces.archivedAt),
			),
		);
	return row?.total ?? 0;
};

export async function syncSeats(organizationId: string): Promise<number> {
	const members = await countMembers(organizationId);

	// The gauge is set, not incremented — `seats` is a current total.
	await meter({ scopeId: organizationId, meter: "seats", amount: members });

	try {
		await syncStripeQuantity(organizationId, members);
	} catch {
		// See the note above: billing reconciles on the next change.
	}
	return members;
}

/**
 * Push the billed quantity to Stripe for a per-seat subscription.
 *
 * Flat tiers return immediately — their price is not a function of headcount,
 * and setting a quantity on one would change what the customer is charged.
 *
 * The floor is applied here as well as at checkout, because a team that shrinks
 * below it must keep a subscription Stripe can price. Proration is Stripe's
 * default, so a mid-period change bills the difference rather than a full cycle.
 */
async function syncStripeQuantity(
	organizationId: string,
	members: number,
): Promise<void> {
	if (!isStripeConfigured()) return;

	const [subscription] = await db
		.select({
			planId: quickengineSubscriptions.planId,
			status: quickengineSubscriptions.status,
			stripeSubscriptionId: quickengineSubscriptions.stripeSubscriptionId,
		})
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.organizationId, organizationId))
		.limit(1);

	if (!subscription?.stripeSubscriptionId) return;
	if (!isPerSeatPlan(subscription.planId)) return;
	// A canceled or past-due subscription is not ours to modify — changing its
	// quantity would either revive it or alter what is already in collections.
	if (subscription.status !== "active" && subscription.status !== "trialing") {
		return;
	}

	const stripe = getStripe();
	const live = await stripe.subscriptions.retrieve(
		subscription.stripeSubscriptionId,
	);
	const item = live.items.data[0];
	if (!item) return;

	const quantity = billableSeats(members);
	// Skip the write when nothing changed. Stripe records an update either way,
	// and a no-op proration line on an invoice is confusing to read.
	if (item.quantity === quantity) return;

	await stripe.subscriptionItems.update(item.id, { quantity });
}

/**
 * Keep the workspace count true after a workspace is created or deleted.
 *
 * No Stripe leg, unlike seats: no tier prices workspaces, they are a ceiling
 * only. Hard rule 7 is why — a workspace is a business outcome the customer
 * earns, and metering one for billing would be charging for their own work.
 * Counting it against a plan ceiling is a different thing entirely.
 */
export async function syncWorkspaces(organizationId: string): Promise<number> {
	const workspaces = await countWorkspaces(organizationId);
	await meter({
		scopeId: organizationId,
		meter: "workspaces",
		amount: workspaces,
	});
	return workspaces;
}

/**
 * May this organization take on one more member?
 *
 * Asked BEFORE the membership is written, with the total the account would have
 * rather than the total it has — `seats` is a gauge, so the allowance is checked
 * against the proposed state, the same shape the file-storage gate uses.
 *
 * Returns rather than throws: the caller owns the HTTP response, and a refusal
 * needs to say which plan and which limit or it is just a wall. Teams has no
 * seat ceiling, so this always admits there — every seat is billed instead.
 */
export async function admitSeat(
	organizationId: string,
): Promise<EnforceResult> {
	const proposed = (await countMembers(organizationId)) + 1;
	return checkAllowance({
		scopeId: organizationId,
		meter: "seats",
		amount: proposed,
	});
}

/** May this organization create one more workspace? Same contract as `admitSeat`. */
export async function admitWorkspace(
	organizationId: string,
): Promise<EnforceResult> {
	const proposed = (await countWorkspaces(organizationId)) + 1;
	return checkAllowance({
		scopeId: organizationId,
		meter: "workspaces",
		amount: proposed,
	});
}

/**
 * The two BUSINESS-VOLUME gates, added 2026-09-06.
 *
 * 🔴 Why they exist. Metering only API requests, storage and AI meant a real
 * single-merchant shop could run on Free permanently: steady retail never comes
 * near 25,000 requests a month, so nothing ever asked them to pay. The only
 * other wall was suppliers, which a shop without suppliers never meets. Free was
 * a home rather than a place you try the product.
 *
 * ⚠️ **A ceiling, never a fee.** `OVERAGE` is `null` for both and must stay
 * `null`. Passing one means this plan is no longer the right plan, exactly like
 * running out of workspaces. Charging per order or per product listed is the
 * per-outcome billing hard rule 7 forbids, and these being meters must never be
 * mistaken for permission to price them.
 *
 * Both are uncapped on every paid tier, so in practice they only ever bind Free.
 */

/**
 * How many products this workspace currently lists for sale.
 *
 * Counts `active` only: a draft is not on sale and an archived item is somebody
 * tidying up, so neither should count against a ceiling. Delisting therefore
 * frees room, which is the behaviour somebody would expect.
 */
export async function countActiveProducts(
	workspaceId: string,
): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				eq(catalogItems.status, "active"),
			),
		);
	return row?.total ?? 0;
}

/**
 * Keep the active-product gauge true after a product is listed, delisted or
 * archived. Recount rather than adjust, the same rule as seats and workspaces:
 * an incrementing counter drifts the first time a call is missed and cannot
 * recover, while a recount converges from any state.
 */
export async function syncActiveProducts(
	organizationId: string,
	workspaceId: string,
): Promise<number> {
	const products = await countActiveProducts(workspaceId);
	await meter({
		scopeId: organizationId,
		meter: "activeProducts",
		amount: products,
	});
	return products;
}

/** May this workspace list one more product? Same contract as `admitWorkspace`. */
export async function admitProduct(
	organizationId: string,
	workspaceId: string,
): Promise<EnforceResult> {
	const proposed = (await countActiveProducts(workspaceId)) + 1;
	return checkAllowance({
		scopeId: organizationId,
		meter: "activeProducts",
		amount: proposed,
	});
}

/**
 * May this account take one more order this period?
 *
 * ⚠️ Unlike products this is a COUNTER, so it is asked against the running
 * period total rather than a recount: an order that happened cannot be undone by
 * deleting the record, and a refunded order still consumed the month. The caller
 * increments with `meter` once the order is actually written.
 */
export async function admitOrder(
	organizationId: string,
): Promise<EnforceResult> {
	const check = await checkAllowance({
		scopeId: organizationId,
		meter: "ordersPerMonth",
		amount: 1,
	});
	// Paid tiers carry no ceiling, so there is nothing to land softly on.
	if (check.limit === null) return check;

	// 🔴 THE SOFT LANDING, and it deliberately OVERRIDES the engine's own answer.
	//
	// `checkAllowance` allows any counter up to (1 + GRACE) x limit, and GRACE is
	// 10%. On a limit of 25 that is 27.5, so it would wave through orders 26 AND
	// 27 before refusing 28. That percentage is right for API requests, where an
	// overshoot is invisible and a hard stop mid-integration is worse than a
	// small overrun. It is wrong here: "you get roughly two and a half more
	// orders" is not a rule anybody can act on.
	//
	// So this decides for itself. One order is allowed past the ceiling and then
	// nothing:
	//
	// ⚠️ `check.used` on a counter is the PROPOSED total, already including this
	// order, not the count before it. So the order being asked about is number
	// `check.used`, and the test is against `limit + 1`:
	//
	//   proposed <= limit     -> ordinary, inside the plan
	//   proposed == limit + 1 -> the crossing order, allowed. It belongs to a
	//                            real shopper standing at a checkout, and
	//                            refusing it costs the merchant a genuine sale
	//                            to a limit they may never have seen. They blame
	//                            the platform, not the plan page.
	//   proposed >  limit + 1 -> the grace is spent. Refused, every time.
	//
	// ⚠️ Exactly one, and never a percentage. "Your next order is your last" is
	// a sentence a merchant can act on; "you have about 10% left" is not.
	return { ...check, allowed: check.used <= check.limit + 1 };
}
