import {
	and,
	db,
	eq,
	orders,
	paymentAccounts,
	payments,
} from "@quickengine/db";
import type { VerifiedProviderEvent } from "./provider";
import { getPaymentProvider } from "./providers";

/**
 * What happens when a provider says a checkout was paid.
 *
 * 🔴 The order is created as a DRAFT during checkout and only becomes `placed`
 * here. Nothing else in the system may promote it: the browser saying "payment
 * succeeded" is a claim, whereas a signed webhook is evidence. A shopper who
 * closes the tab mid-payment still gets their order placed; a shopper who forges
 * a success response gets nothing.
 *
 * ⚠️ Every function here must be IDEMPOTENT. Providers deliver at least once and
 * retry on any non-2xx, so the same `payment_intent.succeeded` will arrive
 * again. Each write is therefore conditional on current state rather than
 * blind.
 */

/** Provider events that change our state. Everything else is acknowledged and ignored. */
const SETTLEMENT_EVENTS = new Set([
	"payment_intent.succeeded",
	"payment_intent.payment_failed",
	"charge.refunded",
]);

export function isSettlementEvent(type: string): boolean {
	return SETTLEMENT_EVENTS.has(type);
}

/**
 * Which workspace a connected-account event belongs to.
 *
 * 🔴 Connect events carry the connected account id, NOT our workspace id, so the
 * account is the only link back. A handler that trusted a workspace id from the
 * event payload would let anyone who can post a webhook name someone else's
 * workspace.
 */
async function workspaceForAccount(
	externalAccountId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ workspaceId: paymentAccounts.workspaceId })
		.from(paymentAccounts)
		.where(eq(paymentAccounts.externalAccountId, externalAccountId))
		.limit(1);
	return row?.workspaceId ?? null;
}

export type SettlementOutcome =
	// `workspaceId` is returned so the CALLER can do workspace-scoped follow-up
	// work — settling a referral, for one — without re-deriving it from the
	// connected account.
	| { applied: true; orderId: string; workspaceId: string; status: string }
	| { applied: false; reason: string };

/**
 * Apply a verified provider event to the order it paid for.
 *
 * Returns rather than throws for anything that is simply not ours to act on —
 * an event for an unknown account, or a payment with no order attached. Throwing
 * would make the provider retry forever on an event that will never apply.
 */
export async function applyCheckoutSettlement(
	event: VerifiedProviderEvent,
	externalAccountId: string | null,
): Promise<SettlementOutcome> {
	if (!isSettlementEvent(event.type)) {
		return { applied: false, reason: "not a settlement event" };
	}
	if (!externalAccountId) {
		return { applied: false, reason: "no connected account on the event" };
	}
	if (!event.externalPaymentId) {
		return { applied: false, reason: "event carries no payment id" };
	}

	const workspaceId = await workspaceForAccount(externalAccountId);
	if (!workspaceId) {
		// An account we have never stored. Acknowledged so the provider stops
		// retrying: this is not a failure, it is somebody else's event.
		return { applied: false, reason: "unknown connected account" };
	}

	// The payment row carries the order it belongs to. Scoped by workspace as
	// well as by provider id, so a collision across tenants cannot cross over.
	const [payment] = await db
		.select({ id: payments.id, orderId: payments.orderId })
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, workspaceId),
				eq(payments.externalPaymentId, event.externalPaymentId),
			),
		)
		.limit(1);

	if (!payment?.orderId) {
		return { applied: false, reason: "no order for this payment" };
	}

	if (event.type === "payment_intent.succeeded") {
		// 🔴 Conditional on `draft`. A redelivered event finds the order already
		// placed and changes nothing — and an order a human has since moved on to
		// `processing` or `fulfilled` is never dragged backwards.
		const [updated] = await db
			.update(orders)
			.set({ status: "placed", placedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(orders.id, payment.orderId),
					eq(orders.workspaceId, workspaceId),
					eq(orders.status, "draft"),
				),
			)
			.returning({ id: orders.id, status: orders.status });

		// ⚠️ Anything that must happen when an order becomes PAID — settling a
		// referral, for instance — belongs to the CALLER, not here. This module
		// owns payments; reaching into orders from it would couple two modules
		// that are deliberately independent, and `applied: true` is the signal the
		// caller needs.
		return updated
			? {
					applied: true,
					orderId: updated.id,
					workspaceId,
					status: updated.status,
				}
			: { applied: false, reason: "order was not awaiting payment" };
	}

	if (event.type === "payment_intent.payment_failed") {
		// Deliberately NOT cancelled. A failed card is usually retried moments
		// later on the same intent, and cancelling would destroy the basket in
		// front of a customer who is about to succeed.
		return { applied: false, reason: "payment failed; order left as draft" };
	}

	return { applied: false, reason: "no action for this event" };
}

/**
 * Record the payment a checkout just opened, in `pending`.
 *
 * 🔴 This row is the ONLY link between a provider's payment id and the order it
 * belongs to. Without it the settlement webhook receives a signed, valid event
 * and has nowhere to apply it — the money moves and the order sits in draft
 * forever.
 *
 * Written after the charge is created rather than before, because a charge that
 * fails to open should leave no payment behind. The window between the two is
 * covered by the provider event itself: it carries the order id in metadata, so
 * a lost row is recoverable by hand rather than silently orphaned.
 */
export async function recordPendingCheckoutPayment(input: {
	workspaceId: string;
	orderId: string;
	clientId: string | null;
	clientEmail: string | null;
	externalPaymentId: string;
	provider: string;
	amountCents: number;
	currency: string;
}): Promise<void> {
	await db
		.insert(payments)
		.values({
			workspaceId: input.workspaceId,
			orderId: input.orderId,
			clientId: input.clientId,
			clientEmail: input.clientEmail,
			provider: input.provider,
			externalPaymentId: input.externalPaymentId,
			amountCents: input.amountCents,
			currency: input.currency,
			status: "pending",
		})
		// A retried checkout with the same provider payment id must not create a
		// second payment. The unique provider/external id index makes this safe;
		// this simply avoids surfacing the expected duplicate error.
		.onConflictDoNothing();
}

export type CheckoutCaptureOutcome =
	| {
			captured: true;
			externalCaptureId: string;
			settled: boolean;
			settlement: SettlementOutcome;
	  }
	| { captured: false; reason: string };

/**
 * Complete a provider order after the buyer approves it in the provider UI.
 * The workspace and stored payment choose the provider; the browser cannot.
 */
export async function captureCheckoutPayment(input: {
	workspaceId: string;
	externalPaymentId: string;
}): Promise<CheckoutCaptureOutcome> {
	const [payment] = await db
		.select({ provider: payments.provider })
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, input.workspaceId),
				eq(payments.externalPaymentId, input.externalPaymentId),
			),
		)
		.limit(1);
	if (!payment) return { captured: false, reason: "Payment not found." };

	const [connected] = await db
		.select({
			provider: paymentAccounts.provider,
			externalAccountId: paymentAccounts.externalAccountId,
		})
		.from(paymentAccounts)
		.where(eq(paymentAccounts.workspaceId, input.workspaceId))
		.limit(1);
	if (
		!connected?.externalAccountId ||
		connected.provider !== payment.provider
	) {
		return { captured: false, reason: "Payment account is not connected." };
	}

	const provider = getPaymentProvider(payment.provider);
	if (!provider.captureCharge) {
		return {
			captured: false,
			reason: "This provider does not use server-side capture.",
		};
	}
	const captured = await provider.captureCharge({
		externalPaymentId: input.externalPaymentId,
		connectedAccountId: connected.externalAccountId,
	});
	return {
		captured: true,
		externalCaptureId: captured.externalCaptureId,
		settled: captured.settled,
		settlement: await applyCheckoutSettlement(
			captured.event,
			captured.event.externalAccountId,
		),
	};
}
