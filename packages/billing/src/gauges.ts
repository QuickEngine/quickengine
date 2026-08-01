import { count, db, eq } from "@quickengine/db";
import {
	quickengineOrganizationMembers,
	quickengineSubscriptions,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { meter } from "./metering";
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
export async function syncSeats(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(quickengineOrganizationMembers)
		.where(eq(quickengineOrganizationMembers.organizationId, organizationId));
	const members = row?.total ?? 0;

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
	const [row] = await db
		.select({ total: count() })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.organizationId, organizationId));
	const workspaces = row?.total ?? 0;
	await meter({
		scopeId: organizationId,
		meter: "workspaces",
		amount: workspaces,
	});
	return workspaces;
}
