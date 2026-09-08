import { db, eq } from "@quickengine/db";
import { quickengineSubscriptions } from "@quickengine/db/schema/quickengine";
import {
	getStoragePack,
	getStoragePackPriceId,
	purchasedStorageBytes,
	type StoragePackId,
	storagePackForPriceId,
} from "./plans";
import { getStripe, isStripeConfigured } from "./stripe";
import { getSubscriptionForOrg } from "./subscriptions";

/**
 * Buying, changing and dropping extra storage.
 *
 * ── Why a subscription item and not a separate purchase ──────────────────────
 *
 * Storage is the only allowance that recurs for as long as the bytes exist, so
 * it has to be a recurring charge. Adding it to the subscription the customer
 * already has means one invoice, one renewal date, one card, and Stripe handles
 * the proration when somebody buys halfway through a month. A second
 * subscription would mean two of everything and a customer wondering why they
 * were charged twice.
 *
 * 🔴 **Packs require a paid plan, deliberately.** A free account has no Stripe
 * subscription to attach an item to, and inventing one to sell 100 GB would be a
 * whole second checkout path to get wrong. Free is not worse off for it: storage
 * overage is 5 cents a gigabyte, which is EXACTLY the small pack rate, so a free
 * account already pays pack prices for the room it uses without having to
 * predict anything. See `storageRebateCents` for why that equality matters.
 */

/**
 * The most packs one account may hold.
 *
 * ⚠️ A typo guard, not a policy. 100 large packs is 50 TB and $1,500 a month,
 * and nobody arrives at that by accident on a self-serve form. Somebody who
 * genuinely needs it is a Custom conversation, not a quantity box.
 */
export const MAX_STORAGE_PACKS = 100;

export type StoragePackResult =
	| { ok: true; packId: StoragePackId | null; quantity: number; bytes: number }
	| {
			ok: false;
			reason:
				| "no_subscription"
				| "subscription_inactive"
				| "price_not_configured"
				| "quantity_out_of_range"
				| "stripe_unavailable";
	  };

/**
 * Set an organization's storage add-on to exactly this pack and quantity.
 *
 * 🔴 Absolute, not incremental. "Set them to three large packs" converges on the
 * same answer whether it is called once or five times; "add a pack" does not,
 * and a retried request would quietly sell somebody storage twice. The same rule
 * the seat and workspace gauges follow, for the same reason.
 *
 * ⚠️ Writes Stripe FIRST and our own row second. If Stripe fails, nothing is
 * recorded and the customer keeps the allowance they paid for. If our write
 * fails after Stripe succeeded, the subscription webhook reconciles it: the
 * charge is real and the row catches up. The other order would grant storage
 * that was never paid for.
 */
export async function setStoragePack({
	organizationId,
	packId,
	quantity,
}: {
	organizationId: string;
	/** Null removes the add-on entirely. */
	packId: StoragePackId | null;
	quantity: number;
}): Promise<StoragePackResult> {
	const wanted = Math.floor(quantity);
	if (!Number.isFinite(wanted) || wanted < 0 || wanted > MAX_STORAGE_PACKS) {
		return { ok: false, reason: "quantity_out_of_range" };
	}
	// A pack with no quantity and a quantity with no pack both mean "none".
	const removing = packId === null || wanted === 0;

	if (!isStripeConfigured()) return { ok: false, reason: "stripe_unavailable" };

	const subscription = await getSubscriptionForOrg(organizationId);
	if (!subscription?.stripeSubscriptionId) {
		return { ok: false, reason: "no_subscription" };
	}
	if (subscription.status !== "active" && subscription.status !== "trialing") {
		return { ok: false, reason: "subscription_inactive" };
	}

	const stripe = getStripe();
	const live = await stripe.subscriptions.retrieve(
		subscription.stripeSubscriptionId,
	);
	// The pack item is found by PRICE, never by position. Stripe does not promise
	// an order, and picking by index would eventually delete somebody's plan.
	const existing = live.items.data.find((item) =>
		item.price?.id ? storagePackForPriceId(item.price.id) : false,
	);

	if (removing) {
		if (existing) await stripe.subscriptionItems.del(existing.id);
		await persist(organizationId, null, 0);
		return { ok: true, packId: null, quantity: 0, bytes: 0 };
	}

	// The add-on follows the plan's own cycle, so both renew together and an
	// annual customer is never handed a monthly line on a yearly invoice.
	const cycle = subscription.billingCycle ?? "monthly";
	const priceId = getStoragePackPriceId(packId, cycle);
	if (!priceId) return { ok: false, reason: "price_not_configured" };

	if (existing) {
		// One call changes both the pack and how many, so switching from two
		// small packs to one large is a single prorated adjustment rather than a
		// removal and a purchase that briefly leaves the customer with nothing.
		await stripe.subscriptionItems.update(existing.id, {
			price: priceId,
			quantity: wanted,
		});
	} else {
		await stripe.subscriptionItems.create({
			subscription: subscription.stripeSubscriptionId,
			price: priceId,
			quantity: wanted,
		});
	}

	await persist(organizationId, packId, wanted);
	return {
		ok: true,
		packId,
		quantity: wanted,
		bytes: purchasedStorageBytes(packId, wanted),
	};
}

async function persist(
	organizationId: string,
	packId: StoragePackId | null,
	quantity: number,
): Promise<void> {
	await db
		.update(quickengineSubscriptions)
		.set({
			storagePackId: packId,
			storagePackQuantity: quantity,
			updatedAt: new Date(),
		})
		.where(eq(quickengineSubscriptions.organizationId, organizationId));
}

/** What an organization currently holds, for the usage screen. */
export async function getStoragePackHolding(organizationId: string): Promise<{
	packId: StoragePackId | null;
	quantity: number;
	bytes: number;
}> {
	const subscription = await getSubscriptionForOrg(organizationId);
	const packId = subscription?.storagePackId ?? null;
	const quantity = subscription?.storagePackQuantity ?? 0;
	// Read back through the ladder rather than trusting the stored id: a pack
	// retired from the ladder must stop granting storage, not keep granting it
	// forever because a row still names it.
	const known = packId ? getStoragePack(packId) : undefined;
	return {
		packId: known ? (known.id as StoragePackId) : null,
		quantity: known ? quantity : 0,
		bytes: purchasedStorageBytes(packId, quantity),
	};
}
