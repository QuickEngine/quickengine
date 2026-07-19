import { db, eq } from "@quickengine/db";
import {
	type QuickEngineBillingCycle,
	type QuickEnginePlanId,
	type QuickEngineSubscriptionStatus,
	quickengineSubscriptions,
} from "@quickengine/db/schema/quickengine";
import type Stripe from "stripe";
import { planIdForPriceId } from "./plans";
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

	const item = sub.items.data[0];
	const priceId = item?.price?.id;
	const planId: QuickEnginePlanId =
		(priceId ? planIdForPriceId(priceId) : undefined) ?? "free";
	const cycle: QuickEngineBillingCycle =
		item?.price?.recurring?.interval === "year" ? "annual" : "monthly";
	const endSeconds = periodEndSeconds(sub);

	const values = {
		planId,
		status: mapStatus(sub.status),
		billingCycle: cycle,
		stripeCustomerId: customerId(sub.customer),
		stripeSubscriptionId: sub.id,
		currentPeriodEndsAt: endSeconds ? new Date(endSeconds * 1000) : null,
		cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
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
