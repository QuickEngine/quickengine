import { and, db, eq, payments } from "@quickengine/db";
import { getPaymentAccount } from "./payments";
import { getPaymentProvider, isChargeableProvider } from "./providers";

/**
 * Actually send the money back.
 *
 * 🔴 Until this existed, `POST /v1/payments/:id/refund` wrote a refund row and
 * called no provider at all. An operator refunded, the record said refunded, and
 * the customer's money never moved — the worst failure in the audit, because it
 * looked like it had worked.
 *
 * ⚠️ The provider call happens OUTSIDE the database transaction, deliberately.
 * Holding a transaction open across a network call keeps row locks for the
 * duration of somebody else's API latency, and a rollback cannot un-refund
 * money that has already left.
 *
 * The consequence is a real window: if the ledger write fails after the provider
 * succeeds, money has moved with no local record. That is recoverable — the
 * provider sends `charge.refunded`, and `payment_refunds` is unique on
 * `(provider, external_refund_id)` so a replay converges — whereas the opposite
 * order (record first, refund second) produces a ledger that lies, which is
 * exactly what this file exists to stop.
 */

export type ProviderRefundOutcome =
	| { refunded: true; externalRefundId: string; settled: boolean }
	| { refunded: false; reason: string };

/**
 * Refund a payment at its provider.
 *
 * Returns `refunded: false` for payments that were never taken through a
 * provider — cash, e-transfer, a cheque recorded after the fact. Those are
 * refunded in person and only need the ledger entry, so this is a normal
 * outcome rather than an error.
 */
export async function refundAtProvider(input: {
	workspaceId: string;
	paymentId: string;
	amountCents?: number;
	reason?: string;
}): Promise<ProviderRefundOutcome> {
	const [payment] = await db
		.select({
			provider: payments.provider,
			externalPaymentId: payments.stripePaymentIntentId,
			status: payments.status,
		})
		.from(payments)
		.where(
			and(
				eq(payments.workspaceId, input.workspaceId),
				eq(payments.id, input.paymentId),
			),
		)
		.limit(1);

	if (!payment) return { refunded: false, reason: "No such payment." };

	// `manual` and anything else we hold no integration for. Recording the refund
	// is the whole job for those.
	if (!isChargeableProvider(payment.provider)) {
		return {
			refunded: false,
			reason: "This payment was not taken through a payment provider.",
		};
	}

	if (!payment.externalPaymentId) {
		return {
			refunded: false,
			reason: "This payment has no provider reference to refund against.",
		};
	}

	// 🔴 Direct charges live on the MERCHANT's account, so the refund must be
	// issued there. Without the account id the provider reports "no such payment"
	// — and the tempting fix, recording it anyway, is the bug this replaced.
	const account = await getPaymentAccount(input.workspaceId);
	if (!account?.stripeAccountId) {
		return {
			refunded: false,
			reason: "The workspace has no connected payment account.",
		};
	}

	const result = await getPaymentProvider(payment.provider).refund({
		externalPaymentId: payment.externalPaymentId,
		connectedAccountId: account.stripeAccountId,
		amountCents: input.amountCents,
		reason: input.reason,
	});

	return {
		refunded: true,
		externalRefundId: result.externalRefundId,
		// `settled: false` is normal — bank rails take days. The ledger records the
		// refund either way; telling a customer their money is back before it is
		// generates the support ticket this distinction avoids.
		settled: result.settled,
	};
}
