import { db, eq } from "@quickengine/db";
import {
	type QuickEngineBillingCycle,
	type QuickEnginePlanId,
	type QuickEngineSubscriptionStatus,
	quickengineSubscriptions,
} from "@quickengine/db/schema/quickengine";
import type Stripe from "stripe";
import { planIdForPriceId, storagePackForPriceId } from "./plans";
import { getStripe } from "./stripe";

// Billing is ORG-scoped: the subscription belongs to an organization (a personal org is an
// individual's billing entity; a shared org is a team's). Everything keys on organizationId.

/** Map Stripe's subscription status to our narrower enum. */
const mapStatus = (
	status: Stripe.Subscription.Status,
): QuickEngineSubscriptionStatus => {
	switch (status) {
		case "trialing":
			return "trialing";
		case "active":
			return "active";
		case "past_due":
		case "unpaid":
			return "past_due";
		case "canceled":
		case "paused":
			return "canceled";
		default:
			// incomplete, incomplete_expired
			return "incomplete";
	}
};

const customerId = (customer: string | { id: string }): string =>
	typeof customer === "string" ? customer : customer.id;

// current_period_end moved from the subscription to its items across Stripe API
// versions; read whichever this account emits without coupling to one version.
const periodEndSeconds = (sub: Stripe.Subscription): number | undefined => {
	const item = sub.items.data[0] as unknown as { current_period_end?: number };
	const top = sub as unknown as { current_period_end?: number };
	return item?.current_period_end ?? top.current_period_end;
};

const firstRowForOrg = async (organizationId: string) => {
	const rows = await db
		.select()
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.organizationId, organizationId))
		.limit(1);
	return rows[0];
};

const orgIdForCustomer = async (id: string): Promise<string | undefined> => {
	const rows = await db
		.select({ organizationId: quickengineSubscriptions.organizationId })
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.stripeCustomerId, id))
		.limit(1);
	return rows[0]?.organizationId ?? undefined;
};

/**
 * Return an organization's Stripe customer ID, creating the customer (and a placeholder
 * `free` subscription row to anchor it) on first use. Idempotent per org.
 */
export const findOrCreateStripeCustomer = async ({
	organizationId,
	email,
	name,
}: {
	organizationId: string;
	email: string;
	name?: string;
}): Promise<string> => {
	const existing = await firstRowForOrg(organizationId);
	if (existing?.stripeCustomerId) {
		// Verify the stored customer still exists at Stripe. If it was deleted, or the row
		// was anchored to a different account (e.g. after a key/env swap), fall through and
		// create a fresh one instead of failing checkout.
		try {
			const stored = await getStripe().customers.retrieve(
				existing.stripeCustomerId,
			);
			if (!("deleted" in stored && stored.deleted)) {
				return existing.stripeCustomerId;
			}
		} catch {
			// "No such customer" (or similar) — recreate below.
		}
	}

	const customer = await getStripe().customers.create({
		email,
		name,
		metadata: { organizationId },
	});

	if (existing) {
		await db
			.update(quickengineSubscriptions)
			.set({ stripeCustomerId: customer.id, updatedAt: new Date() })
			.where(eq(quickengineSubscriptions.id, existing.id));
	} else {
		await db.insert(quickengineSubscriptions).values({
			organizationId,
			stripeCustomerId: customer.id,
			planId: "free",
			status: "active",
		});
	}

	return customer.id;
};

/** Upsert the organization's subscription row from a Stripe subscription object. */
export const upsertSubscriptionFromStripe = async (
	sub: Stripe.Subscription,
): Promise<void> => {
	const organizationId =
		sub.metadata?.organizationId ??
		(await orgIdForCustomer(customerId(sub.customer)));
	if (!organizationId) {
		return; // Can't map this subscription to an org — nothing to do.
	}

	/**
	 * 🔴 The plan is the item whose price MAPS TO A PLAN, never `data[0]`.
	 *
	 * A subscription stopped being one line the day storage packs were added to
	 * it. Stripe does not promise an order for `items.data`, so reading position
	 * zero would sooner or later find the storage pack, fail to map it to a plan,
	 * and fall back to `"free"` — silently downgrading a paying customer to the
	 * free tier's limits from a routine webhook, with nothing in the logs and no
	 * failed payment to explain it.
	 *
	 * ⚠️ The fallback to `data[0]` only survives for the case it always covered:
	 * a subscription on a price we do not recognise at all, which still resolves
	 * to free exactly as before.
	 */
	const items = sub.items.data;
	const planItem =
		items.find((entry) =>
			entry.price?.id ? planIdForPriceId(entry.price.id) : false,
		) ?? items[0];
	const priceId = planItem?.price?.id;
	const planId: QuickEnginePlanId =
		(priceId ? planIdForPriceId(priceId) : undefined) ?? "free";
	const cycle: QuickEngineBillingCycle =
		planItem?.price?.recurring?.interval === "year" ? "annual" : "monthly";
	const endSeconds = periodEndSeconds(sub);

	/**
	 * The storage add-on, reconciled from the same event.
	 *
	 * Stripe is the authority on what the customer is actually paying for, so an
	 * item added, changed or removed anywhere — our own API, the Stripe
	 * dashboard, a dunning cancellation — lands here. An absent item means no
	 * packs, which is what clears the allowance when somebody drops the add-on.
	 */
	const packItem = items.find((entry) =>
		entry.price?.id ? storagePackForPriceId(entry.price.id) : false,
	);
	const pack = packItem?.price?.id
		? storagePackForPriceId(packItem.price.id)
		: undefined;

	const values = {
		planId,
		status: mapStatus(sub.status),
		billingCycle: cycle,
		stripeCustomerId: customerId(sub.customer),
		stripeSubscriptionId: sub.id,
		currentPeriodEndsAt: endSeconds ? new Date(endSeconds * 1000) : null,
		cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
		storagePackId: pack?.id ?? null,
		storagePackQuantity: pack ? (packItem?.quantity ?? 0) : 0,
		updatedAt: new Date(),
	};

	const row = await firstRowForOrg(organizationId);
	if (row) {
		await db
			.update(quickengineSubscriptions)
			.set(values)
			.where(eq(quickengineSubscriptions.id, row.id));
	} else {
		await db
			.insert(quickengineSubscriptions)
			.values({ organizationId, ...values });
	}
};

/** A subscription was fully deleted at Stripe — drop the org back to free. */
export const markSubscriptionCanceled = async (
	sub: Stripe.Subscription,
): Promise<void> => {
	const id = customerId(sub.customer);
	await db
		.update(quickengineSubscriptions)
		.set({
			status: "canceled",
			planId: "free",
			cancelAtPeriodEnd: false,
			updatedAt: new Date(),
		})
		.where(eq(quickengineSubscriptions.stripeCustomerId, id));
};

/** Flip status for a customer (used by invoice paid / payment-failed events). */
export const setStatusForCustomer = async (
	stripeCustomerId: string,
	status: QuickEngineSubscriptionStatus,
): Promise<void> => {
	await db
		.update(quickengineSubscriptions)
		.set({ status, updatedAt: new Date() })
		.where(eq(quickengineSubscriptions.stripeCustomerId, stripeCustomerId));
};

/** Read an organization's current subscription (for UI / entitlement checks). */
export const getSubscriptionForOrg = async (organizationId: string) =>
	firstRowForOrg(organizationId);

/**
 * The Stripe customer already on file for an organization, or null.
 *
 * Distinct from `findOrCreateStripeCustomer` because auto-recharge runs with **no
 * user present** — there is no email to create a customer with, and inventing one
 * would attach a charge to an account nobody can reconcile. If there is no
 * customer, there was never a saved card, so there is nothing to charge.
 */
export const findStripeCustomerForOrg = async (
	organizationId: string,
): Promise<string | null> => {
	const existing = await firstRowForOrg(organizationId);
	return existing?.stripeCustomerId ?? null;
};
