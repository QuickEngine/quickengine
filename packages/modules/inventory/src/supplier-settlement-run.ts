import {
	and,
	db,
	eq,
	supplierPaymentEvents,
	supplierPayments,
} from "@quickengine/db";
import { settlementEligibility } from "./supplier-settlement";

/**
 * Actually settling a supplier obligation, and surviving every way it can fail.
 *
 * ── The failure this is built around ─────────────────────────────────────────
 *
 * 🔴 A provider can accept a transfer and this process can die before writing
 * that down. That is not an edge case — it is the normal consequence of a deploy
 * landing at the wrong moment. So the row is moved to `initiated` and its
 * idempotency key committed BEFORE the provider is called, and a row found in
 * `initiated` is never retried blindly: the provider may already be holding it,
 * and reconciliation decides.
 *
 * ⚠️ Nothing here runs inside checkout. A supplier transfer failing must never
 * make a paid customer order invalid — the customer has paid, the sale stands,
 * and the supplier being unpayable right now is an operational problem, not a
 * reason to reject money.
 */

export type SettlementOutcome =
	| { settled: true; externalTransferId: string; amountCents: number }
	| { settled: false; reason: string; retryable: boolean };

type Transferer = (input: {
	environment: "test" | "live";
	destinationAccountId: string;
	amountCents: number;
	currency: string;
	idempotencyKey: string;
	sourceTransactionId?: string | null;
	description: string;
	metadata: Record<string, string>;
}) => Promise<{ externalTransferId: string; amountCents: number }>;

const note = async (
	supplierPaymentId: string,
	workspaceId: string,
	kind: string,
	detail?: string,
) => {
	await db.insert(supplierPaymentEvents).values({
		supplierPaymentId,
		workspaceId,
		kind,
		actor: "settlement-worker",
		detail: detail ?? null,
	});
};

/**
 * Settle one obligation.
 *
 * 🔑 The transfer function is injected. Money movement is the one thing that
 * cannot be exercised honestly against a real provider in a test suite, and a
 * seam here is what lets the crash, the duplicate and the refusal all be
 * reproduced deterministically.
 */
export async function settleSupplierPayment(
	workspaceId: string,
	supplierPaymentId: string,
	transfer: Transferer,
	context?: { sourceTransactionId?: string | null; description?: string },
): Promise<SettlementOutcome> {
	const eligibility = await settlementEligibility(
		workspaceId,
		supplierPaymentId,
	);
	if (!eligibility.eligible) {
		return {
			settled: false,
			reason: eligibility.reason,
			// Onboarding finishing later is normal; an obligation already paid is
			// not going to become unpaid.
			retryable:
				eligibility.reason === "SUPPLIER_NOT_ONBOARDED" ||
				eligibility.reason === "SUPPLIER_CANNOT_RECEIVE_YET" ||
				eligibility.reason === "SUPPLIER_ACCOUNT_NOT_ACTIVE",
		};
	}

	/**
	 * 🔴 CLAIM the row before calling the provider.
	 *
	 * The `where` clause is the claim: only a row still in a pre-flight state is
	 * moved to `initiated`, so two workers racing produce exactly one winner and
	 * the loser sees zero rows updated. Without this, both would call the
	 * provider — and while the idempotency key would save us, relying on a remote
	 * system to be the only guard against paying twice is not a design.
	 */
	const claimed = await db
		.update(supplierPayments)
		.set({
			status: "initiated",
			initiatedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(supplierPayments.id, supplierPaymentId),
				eq(supplierPayments.workspaceId, workspaceId),
				// Only from a state that has never been sent.
				eq(supplierPayments.status, "calculated"),
			),
		)
		.returning();

	const row = claimed[0];
	if (!row) {
		const [current] = await db
			.select()
			.from(supplierPayments)
			.where(eq(supplierPayments.id, supplierPaymentId))
			.limit(1);
		if (current?.status === "pending") {
			// A second pre-flight state exists for scheduling; claim from it too.
			const retry = await db
				.update(supplierPayments)
				.set({
					status: "initiated",
					initiatedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(supplierPayments.id, supplierPaymentId),
						eq(supplierPayments.status, "pending"),
					),
				)
				.returning();
			if (!retry[0])
				return {
					settled: false,
					reason: "CLAIMED_ELSEWHERE",
					retryable: false,
				};
			return await send(
				retry[0],
				eligibility.destinationAccountId,
				transfer,
				context,
			);
		}
		return { settled: false, reason: "CLAIMED_ELSEWHERE", retryable: false };
	}

	return await send(row, eligibility.destinationAccountId, transfer, context);
}

async function send(
	row: typeof supplierPayments.$inferSelect,
	destinationAccountId: string,
	transfer: Transferer,
	context?: { sourceTransactionId?: string | null; description?: string },
): Promise<SettlementOutcome> {
	await note(
		row.id,
		row.workspaceId,
		"initiated",
		`${row.amountCents} ${row.currency}`,
	);

	try {
		const result = await transfer({
			environment: row.environment,
			destinationAccountId,
			amountCents: row.amountCents,
			currency: row.currency,
			// 🔴 The stored key, never a fresh one. This is what makes a retry
			// after a crash return the original transfer instead of making another.
			idempotencyKey: row.idempotencyKey,
			sourceTransactionId: context?.sourceTransactionId ?? null,
			description: context?.description ?? `Supplier settlement`,
			metadata: {
				workspaceId: row.workspaceId,
				supplierId: row.supplierId,
				purchaseOrderId: row.purchaseOrderId,
				supplierPaymentId: row.id,
			},
		});

		await db
			.update(supplierPayments)
			.set({
				status: "succeeded",
				externalTransferId: result.externalTransferId,
				succeededAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(supplierPayments.id, row.id));
		await note(row.id, row.workspaceId, "succeeded", result.externalTransferId);

		return {
			settled: true,
			externalTransferId: result.externalTransferId,
			amountCents: result.amountCents,
		};
	} catch (error) {
		const e = error as { code?: string; message?: string; retryable?: boolean };
		/**
		 * ⚠️ Returned to a pre-flight state ONLY when the provider clearly refused.
		 *
		 * A network error is not a refusal: the request may have arrived and
		 * succeeded. Those stay `initiated` for reconciliation to resolve against
		 * the provider, because the alternative is retrying something that already
		 * worked.
		 */
		const clearlyRefused = e.retryable === false;
		await db
			.update(supplierPayments)
			.set({
				status: clearlyRefused ? "failed" : "initiated",
				failureCode: e.code ?? "unknown",
				failureMessage: e.message ?? null,
				updatedAt: new Date(),
			})
			.where(eq(supplierPayments.id, row.id));
		await note(
			row.id,
			row.workspaceId,
			clearlyRefused ? "failed" : "uncertain",
			`${e.code ?? "unknown"}: ${e.message ?? ""}`,
		);

		return {
			settled: false,
			reason: e.code ?? "TRANSFER_FAILED",
			retryable: e.retryable !== false,
		};
	}
}

/**
 * A customer's money is going back. Undo the supplier side to match.
 *
 * 🔴 Three genuinely different situations, and conflating them loses money:
 *
 * 1. **Nothing was sent yet** — cancel the obligation. Nobody is out anything.
 * 2. **It was sent and is still in the supplier's provider balance** — reverse
 *    it, in part or in full.
 * 3. **It was sent and has been paid out to their bank** — no API recovers it.
 *    Recorded as owed back, and a person has to ask.
 *
 * ⚠️ Never deletes the row. "This was paid and then clawed back" and "this was
 * never paid" are different facts, and a supplier disputing an invoice needs the
 * first one to still exist.
 */
export async function unwindSupplierPayment(input: {
	workspaceId: string;
	purchaseOrderId: string;
	/** How much of the customer's money is going back, in the same currency. */
	refundedCents: number;
	reason: string;
	reverse?: (input: {
		environment: "test" | "live";
		externalTransferId: string;
		amountCents: number;
		idempotencyKey: string;
		reason: string;
	}) => Promise<{ reversedCents: number }>;
}): Promise<
	| { outcome: "cancelled" }
	| { outcome: "reversed"; reversedCents: number }
	| { outcome: "unrecoverable"; owedBackCents: number; reason: string }
	| { outcome: "nothing-to-do" }
> {
	const [row] = await db
		.select()
		.from(supplierPayments)
		.where(
			and(
				eq(supplierPayments.workspaceId, input.workspaceId),
				eq(supplierPayments.purchaseOrderId, input.purchaseOrderId),
			),
		)
		.limit(1);
	if (!row) return { outcome: "nothing-to-do" };

	// ── Never sent ───────────────────────────────────────────────────────────
	if (
		row.status === "calculated" ||
		row.status === "pending" ||
		row.status === "failed"
	) {
		await db
			.update(supplierPayments)
			.set({
				status: "cancelled",
				reversalReason: input.reason,
				updatedAt: new Date(),
			})
			.where(eq(supplierPayments.id, row.id));
		await note(row.id, row.workspaceId, "cancelled", input.reason);
		return { outcome: "cancelled" };
	}

	if (row.status !== "succeeded" || !row.externalTransferId) {
		// `initiated` with no id: reconciliation must settle what happened first.
		return { outcome: "nothing-to-do" };
	}

	/**
	 * How much of the supplier's money to pull back.
	 *
	 * ⚠️ Proportional to the refund, capped at what is left. A customer refunded
	 * half their order does not undo the whole supplier obligation, and a second
	 * partial refund must not pull back more than remains.
	 */
	const alreadyReversed = row.reversedCents;
	const outstanding = row.amountCents - alreadyReversed;
	if (outstanding <= 0) return { outcome: "nothing-to-do" };
	const want = Math.min(outstanding, input.refundedCents);
	if (want <= 0) return { outcome: "nothing-to-do" };

	if (!input.reverse) {
		return {
			outcome: "unrecoverable",
			owedBackCents: want,
			reason: "NO_REVERSAL_AVAILABLE",
		};
	}

	try {
		const result = await input.reverse({
			environment: row.environment,
			externalTransferId: row.externalTransferId,
			amountCents: want,
			// Derived, so a retried refund cannot reverse twice.
			idempotencyKey: `supplier-reversal:${row.purchaseOrderId}:${alreadyReversed + want}`,
			reason: input.reason,
		});
		const reversedTotal = alreadyReversed + result.reversedCents;
		await db
			.update(supplierPayments)
			.set({
				reversedCents: reversedTotal,
				status: reversedTotal >= row.amountCents ? "reversed" : "succeeded",
				reversedAt: new Date(),
				reversalReason: input.reason,
				updatedAt: new Date(),
			})
			.where(eq(supplierPayments.id, row.id));
		await note(
			row.id,
			row.workspaceId,
			"reversed",
			`${result.reversedCents} of ${row.amountCents}`,
		);
		return { outcome: "reversed", reversedCents: result.reversedCents };
	} catch (error) {
		/**
		 * 🔴 The money has left the provider. Recorded, surfaced, and left for a
		 * person — pretending otherwise would put a false balance in the ledger.
		 */
		const message =
			(error as { message?: string }).message ?? "reversal refused";
		await db
			.update(supplierPayments)
			.set({
				failureCode: "REVERSAL_FAILED",
				failureMessage: message,
				updatedAt: new Date(),
			})
			.where(eq(supplierPayments.id, row.id));
		await note(row.id, row.workspaceId, "reversal-failed", message);
		return { outcome: "unrecoverable", owedBackCents: want, reason: message };
	}
}
