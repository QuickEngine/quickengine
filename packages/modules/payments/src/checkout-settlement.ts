import {
	and,
	db,
	desc,
	eq,
	orders,
	paymentAccounts,
	payments,
	recordOutboxEvent,
} from "@quickengine/db";
import { setPaymentStatus } from "./payments";
import type {
	PaymentEnvironment,
	PaymentProviderId,
	VerifiedProviderEvent,
} from "./provider";
import { getPaymentProvider } from "./providers";

/**
 * Move the payment row to a settled status, tolerating every shape of redelivery.
 *
 * Stripe retries on any non-2xx, so this runs again for events already applied.
 * `setPaymentStatus` signals both "already there" and "already moved past" by
 * throwing, and here each means the work is done, not that it failed. Letting
 * either escape would answer the provider non-2xx and buy an infinite retry of
 * a settlement that already happened.
 *
 * A genuine fault still propagates.
 */
async function settlePaymentRow(
	workspaceId: string,
	paymentId: string,
	status: "succeeded" | "refunded" | "disputed",
) {
	try {
		await setPaymentStatus(workspaceId, paymentId, status);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "";
		if (
			reason === "PAYMENT_STATUS_UNCHANGED" ||
			reason === "PAYMENT_ILLEGAL_TRANSITION"
		) {
			return;
		}
		throw error;
	}
}

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
	// 🔴 A dispute is the one provider event with a DEADLINE on it. The money is
	// already gone from the business's balance and there is a window to respond;
	// missing it loses the money by default. Everything else here can be
	// discovered late without cost.
	"charge.dispute.created",
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
	provider: PaymentProviderId,
	environment: PaymentEnvironment,
): Promise<string | null> {
	const [row] = await db
		.select({ workspaceId: paymentAccounts.workspaceId })
		.from(paymentAccounts)
		.where(
			and(
				eq(paymentAccounts.externalAccountId, externalAccountId),
				eq(paymentAccounts.provider, provider),
				eq(paymentAccounts.environment, environment),
			),
		)
		.limit(1);
	return row?.workspaceId ?? null;
}

export type SettlementOutcome =
	// `workspaceId` is returned so the CALLER can do workspace-scoped follow-up
	// work — settling a referral, for one — without re-deriving it from the
	// connected account.
	| { applied: true; orderId: string; workspaceId: string; status: string }
	/**
	 * Not applied, and whether that is NORMAL or ALARMING.
	 *
	 * 🔴 This distinction is the whole point. Most unapplied events are somebody
	 * else's business — a provider sends every event type to every endpoint, and
	 * "not a settlement event" is the expected answer for nearly all of them.
	 * But a settlement event we could not act on is a real divergence: the
	 * provider believes money moved and QuickDash has no record of it.
	 *
	 * Both answer 200, because a non-2xx makes the provider redeliver forever.
	 * Without `expected` the caller cannot tell them apart, so it logs neither —
	 * which is exactly how a refund defect stayed invisible in Stripe for three
	 * PRs while every webhook returned success.
	 */
	| { applied: false; reason: string; expected: boolean };

export type PaidCheckoutCoordinator = (input: {
	eventId: string;
	orderId: string;
	paymentId: string;
	provider: PaymentProviderId;
	workspaceId: string;
}) => Promise<SettlementOutcome>;

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
	provider: PaymentProviderId,
	environment: PaymentEnvironment,
	paidCheckoutCoordinator?: PaidCheckoutCoordinator,
): Promise<SettlementOutcome> {
	if (!isSettlementEvent(event.type)) {
		return { applied: false, reason: "not a settlement event", expected: true };
	}
	if (!externalAccountId) {
		return {
			applied: false,
			reason: "no connected account on the event",
			expected: false,
		};
	}
	if (!event.externalPaymentId) {
		return {
			applied: false,
			reason: "event carries no payment id",
			expected: false,
		};
	}

	const workspaceId = await workspaceForAccount(
		externalAccountId,
		provider,
		environment,
	);
	if (!workspaceId) {
		// An account we have never stored. Acknowledged so the provider stops
		// retrying: this is not a failure, it is somebody else's event.
		return {
			applied: false,
			reason: "unknown connected account",
			expected: true,
		};
	}

	// The payment row carries the order it belongs to. Scoped by workspace as
	// well as by provider id, so a collision across tenants cannot cross over.
	const [payment] = await db
		.select({ id: payments.id, orderId: payments.orderId })
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, workspaceId),
				eq(payments.provider, provider),
				eq(payments.environment, environment),
				eq(payments.externalPaymentId, event.externalPaymentId),
			),
		)
		.limit(1);

	if (!payment?.orderId) {
		return {
			applied: false,
			reason: "no order for this payment",
			expected: false,
		};
	}

	if (event.type === "payment_intent.succeeded") {
		// Cross-module consequences belong to the API composition boundary. When a
		// coordinator is supplied it settles Payment + Order + Inventory + audit +
		// outbox in one transaction. The fallback remains for module-only callers.
		if (paidCheckoutCoordinator) {
			return paidCheckoutCoordinator({
				eventId: event.id,
				orderId: payment.orderId,
				paymentId: payment.id,
				provider,
				workspaceId,
			});
		}
		// 🔴 The MONEY is settled first, and deliberately NOT gated on the order
		// transition below.
		//
		// These are two different facts. An order can already be `placed` while its
		// payment is still `pending` — a redelivery, or a human who moved the order
		// on — and gating the payment on the order update would leave that row
		// stranded in `pending` forever. That is not cosmetic: a refund requires
		// `succeeded`, so a stranded payment can never be refunded, and Payments
		// shows real money as still pending.
		//
		// Found on 2026-08-11 by the first real Caffeinate purchase: the webhook
		// placed the order correctly and nothing ever settled the payment.
		await settlePaymentRow(workspaceId, payment.id, "succeeded");

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
			: {
					applied: false,
					reason: "order was not awaiting payment",
					expected: true,
				};
	}

	if (event.type === "charge.refunded") {
		// 🔴 `charge.refunded` was listed as a settlement event and then handled
		// nowhere, so it fell through to "no action for this event" and QuickDash
		// acknowledged a refund it never recorded.
		//
		// That silence mattered most on the path the product itself recommends: the
		// Payments module tells an operator to refund through Stripe, and Stripe
		// announces it here. It also leaves a refund issued outside QuickDash, or
		// one stranded by a failed API call, permanently invisible with no way to
		// reconcile. Found 2026-08-11 after a sandbox refund went through at Stripe
		// and left no trace here.
		//
		// `setPaymentStatus` owns what "refunded" means: it records the outstanding
		// remainder in `payment_refunds` and reconciles any invoice, so a partial
		// refund already taken at the provider is not double counted.
		await settlePaymentRow(workspaceId, payment.id, "refunded");

		// The ORDER is deliberately untouched. A refund is not a cancellation, and
		// whether a refunded order stays placed, gets cancelled or goes back for
		// fulfillment is the operator's decision, not this webhook's.
		return {
			applied: false,
			reason: "refund recorded against the payment",
			expected: true,
		};
	}

	if (event.type === "charge.dispute.created") {
		// The money is already gone from the business's balance and a response
		// window has started. Recording it is what puts it in front of a person;
		// until this existed, a dispute reached QuickDash nowhere at all.
		//
		// `disputed` is a non-terminal status — a won dispute goes back to
		// `succeeded` — so this does not strand the payment the way marking it
		// failed would.
		await settlePaymentRow(workspaceId, payment.id, "disputed");
		await recordOutboxEvent({
			workspaceId,
			aggregateType: "payment",
			aggregateId: payment.id,
			eventName: "payment.status-changed",
			payload: { paymentId: payment.id, status: "disputed" },
			// 🔑 The PROVIDER's event id, so a redelivered dispute is the same
			// notification rather than a second one.
			requestId: event.id,
			actorType: "payment_provider",
		});

		// The ORDER is untouched, as with a refund. Whether a disputed order still
		// ships is the operator's decision.
		return {
			applied: false,
			reason: "dispute recorded against the payment",
			expected: true,
		};
	}

	if (event.type === "payment_intent.payment_failed") {
		// Deliberately NOT cancelled. A failed card is usually retried moments
		// later on the same intent, and cancelling would destroy the basket in
		// front of a customer who is about to succeed.
		//
		// ⚠️ And deliberately NOT announced. A declined card is ordinary traffic in
		// a shop — wrong CVC, insufficient funds — and the customer almost always
		// retries within seconds. Notifying on each one is how the bell becomes
		// something nobody reads, which then hides the dispute above it.
		return {
			applied: false,
			reason: "payment failed; order left as draft",
			expected: true,
		};
	}

	return { applied: false, reason: "no action for this event", expected: true };
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
	environment: PaymentEnvironment;
}): Promise<void> {
	await db
		.insert(payments)
		.values({
			workspaceId: input.workspaceId,
			orderId: input.orderId,
			clientId: input.clientId,
			clientEmail: input.clientEmail,
			provider: input.provider,
			environment: input.environment,
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
 *
 * environment-unfiltered: the payment is found by the PROVIDER's own id, which
 * is issued per mode and never collides across them, so finding it at all
 * settles which mode this is. Its `environment` is then what scopes everything
 * below, including which connected account may capture it.
 */
export async function captureCheckoutPayment(
	input: {
		workspaceId: string;
		externalPaymentId: string;
	},
	paidCheckoutCoordinator?: PaidCheckoutCoordinator,
): Promise<CheckoutCaptureOutcome> {
	const [payment] = await db
		.select({
			provider: payments.provider,
			environment: payments.environment,
		})
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, input.workspaceId),
				eq(payments.externalPaymentId, input.externalPaymentId),
			),
		)
		.limit(1);
	if (!payment) return { captured: false, reason: "Payment not found." };

	/**
	 * 🔴 The connected account must be chosen BY the payment's provider and mode,
	 * not found first and checked afterwards.
	 *
	 * This took the workspace's first account row and then refused if it happened
	 * to be the wrong one. A workspace with both a sandbox and a live connection —
	 * which is every workspace that tested before going live — would have a real
	 * capture refused as "not connected" whenever the sandbox row sorted first.
	 * The buyer's money is authorised and never taken, and nothing says why.
	 */
	const [connected] = await db
		.select({
			provider: paymentAccounts.provider,
			environment: paymentAccounts.environment,
			externalAccountId: paymentAccounts.externalAccountId,
		})
		.from(paymentAccounts)
		.where(
			and(
				eq(paymentAccounts.workspaceId, input.workspaceId),
				eq(paymentAccounts.provider, payment.provider),
				eq(paymentAccounts.environment, payment.environment),
			),
		)
		.orderBy(desc(paymentAccounts.isDefault))
		.limit(1);
	if (!connected?.externalAccountId) {
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
		environment: payment.environment,
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
			payment.provider as PaymentProviderId,
			payment.environment,
			paidCheckoutCoordinator,
		),
	};
}
