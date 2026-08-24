// Type-only: erased at compile time, so it never enters the runtime module
// graph of route registration (hard rule 12 concerns real imports).
import type Stripe from "stripe";
import type { PaymentEnvironment } from "./provider";

/**
 * Moving a supplier's money, and pulling it back when a sale is undone.
 *
 * ── How the money actually gets here ─────────────────────────────────────────
 *
 * 🔴 The charge is a DIRECT charge on the business's own connected account and
 * stays that way — the customer's statement says the business, the business owns
 * its disputes, and the business pays the processing fee. None of that changes.
 *
 * What changes is that the charge carries an `application_fee_amount` equal to
 * what the suppliers on that order are owed. Stripe moves exactly that much into
 * the PLATFORM balance at capture, so the platform is holding the supplier's
 * money and nothing else. This then sends it on.
 *
 * ⚠️ QuickEngine earns NOTHING from it. The fee is a pass-through: every cent
 * collected is transferred out. It is recorded as `supplierFeeCents` rather than
 * `applicationFeeCents` precisely so it is never mistaken for revenue.
 */

export class SupplierTransferError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly retryable: boolean,
	) {
		super(message);
	}
}

async function stripeFor(environment: PaymentEnvironment) {
	// Lazily imported: nothing about defining this needs the SDK in the module
	// graph of route registration.
	const [{ default: Stripe }, { serverEnv }] = await Promise.all([
		import("stripe"),
		import("@quickengine/env/server"),
	]);
	const secret =
		environment === "test"
			? serverEnv.STRIPE_CONNECT_TEST_SECRET_KEY
			: serverEnv.STRIPE_CONNECT_LIVE_SECRET_KEY;
	if (!secret) {
		throw new SupplierTransferError(
			`Stripe Connect ${environment} mode is not configured.`,
			"NOT_CONFIGURED",
			false,
		);
	}
	return new Stripe(secret);
}

export type SupplierTransferResult = {
	externalTransferId: string;
	amountCents: number;
	currency: string;
};

/**
 * Send a supplier what a purchase order says they are owed.
 *
 * 🔴 The idempotency key is SUPPLIED, not generated here, and it is derived from
 * the purchase order. That is what makes this safe to call again after a crash:
 * Stripe returns the original transfer rather than making a second one. A key
 * invented at call time would defeat the entire guarantee, because the crash
 * being defended against happens *after* Stripe succeeds.
 *
 * ⚠️ `sourceTransactionId` is passed when known. It ties the transfer to the
 * charge that funded it, which lets Stripe release the money as that specific
 * payment settles rather than requiring the platform balance to be positive
 * already — the difference between a transfer that works on day one and one that
 * fails until enough unrelated volume has accumulated.
 */
export async function sendSupplierTransfer(input: {
	environment: PaymentEnvironment;
	destinationAccountId: string;
	amountCents: number;
	currency: string;
	idempotencyKey: string;
	sourceTransactionId?: string | null;
	/**
	 * What the supplier reads against the money.
	 *
	 * ⚠️ It should name the BUSINESS and its order, because the economic
	 * relationship is the business owing the supplier — the platform is only the
	 * mechanism.
	 *
	 * 🔴 Setting this on the transfer alone does NOT reach them. Verified against
	 * Stripe test mode on 2026-08-23: reading the resulting payment back through
	 * the recipient's own credentials returned `description: null` and
	 * `metadata: {}`. The transfer's description stays on the PLATFORM's copy.
	 * The supplier's copy is a separate object and has to be labelled separately,
	 * which `labelDestinationPayment` below does.
	 */
	description: string;
	metadata: Record<string, string>;
}): Promise<SupplierTransferResult> {
	const stripe = await stripeFor(input.environment);
	try {
		const transfer = await stripe.transfers.create(
			{
				amount: input.amountCents,
				currency: input.currency.toLowerCase(),
				destination: input.destinationAccountId,
				description: input.description,
				metadata: input.metadata,
				...(input.sourceTransactionId
					? { source_transaction: input.sourceTransactionId }
					: {}),
			},
			{ idempotencyKey: input.idempotencyKey },
		);
		await labelDestinationPayment({
			stripe,
			destinationAccountId: input.destinationAccountId,
			destinationPaymentId:
				typeof transfer.destination_payment === "string"
					? transfer.destination_payment
					: (transfer.destination_payment?.id ?? null),
			description: input.description,
			metadata: input.metadata,
		});
		return {
			externalTransferId: transfer.id,
			amountCents: transfer.amount,
			currency: transfer.currency.toUpperCase(),
		};
	} catch (error) {
		throw asTransferError(error);
	}
}

/**
 * Write the business's name and order onto the supplier's own copy of the money.
 *
 * 🔴 Without this the supplier sees an unexplained deposit. Their balance line
 * carries no description, no metadata and no hint of which order it settles —
 * the only party named anywhere on their side is the PLATFORM, via Stripe's
 * `application_name`, which cannot be removed or overridden. Labelling here is
 * what makes the deposit read as the business paying them.
 *
 * ⚠️ Best-effort ON PURPOSE. By the time this runs the money has already moved,
 * and that is the part that must not be undone. A failure to annotate is a
 * cosmetic problem; throwing here would turn it into a transfer the ledger
 * believes failed and might send again.
 */
async function labelDestinationPayment(input: {
	stripe: Stripe;
	destinationAccountId: string;
	destinationPaymentId: string | null;
	description: string;
	metadata: Record<string, string>;
}): Promise<void> {
	if (!input.destinationPaymentId) return;
	try {
		await input.stripe.charges.update(
			input.destinationPaymentId,
			{ description: input.description, metadata: input.metadata },
			{ stripeAccount: input.destinationAccountId },
		);
	} catch {
		// Deliberately swallowed — see the note above.
	}
}

/**
 * Pull a supplier transfer back, in whole or in part.
 *
 * 🔴 Only possible while the money is still in the supplier's Stripe balance.
 * Once Stripe has paid it out to their bank, no API recovers it — that becomes a
 * conversation and, if it goes badly, a legal matter. This reports which
 * happened rather than pretending reversal always works.
 *
 * ⚠️ Partial reversals are supported and are the common case: a customer
 * returning one item of three does not undo the whole supplier obligation.
 */
export async function reverseSupplierTransfer(input: {
	environment: PaymentEnvironment;
	externalTransferId: string;
	amountCents: number;
	idempotencyKey: string;
	reason: string;
}): Promise<{ reversedCents: number; externalReversalId: string }> {
	const stripe = await stripeFor(input.environment);
	try {
		const reversal = await stripe.transfers.createReversal(
			input.externalTransferId,
			{
				amount: input.amountCents,
				metadata: { reason: input.reason },
				/**
				 * ⚠️ Deliberately NOT refunding the application fee here.
				 *
				 * The fee is the supplier's money passing through, and it is
				 * reconciled against the customer refund separately. Letting Stripe
				 * decide both at once makes the ledger unable to explain which
				 * movement undid which.
				 */
				refund_application_fee: false,
			},
			{ idempotencyKey: input.idempotencyKey },
		);
		return {
			reversedCents: reversal.amount,
			externalReversalId: reversal.id,
		};
	} catch (error) {
		throw asTransferError(error);
	}
}

/**
 * Turn a provider error into something the ledger can act on.
 *
 * 🔑 `retryable` is the only question that matters to a worker. A balance that
 * is temporarily short will succeed later; a destination that cannot accept
 * money never will, and retrying it forever hides the problem from the person
 * who could fix it.
 */
function asTransferError(error: unknown): SupplierTransferError {
	const e = error as { code?: string; type?: string; message?: string };
	const code = e.code ?? e.type ?? "unknown";
	const retryable =
		code === "balance_insufficient" ||
		code === "lock_timeout" ||
		code === "rate_limit" ||
		code === "api_connection_error" ||
		code === "api_error";
	return new SupplierTransferError(
		e.message ?? "The transfer could not be created.",
		code,
		retryable,
	);
}
