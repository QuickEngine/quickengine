import type { SupplierTransferer } from "./supplier-settlement";

/**
 * Settle supplier obligations that could not be paid when the order was.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 The common case is not a failure at all: a supplier has been recorded and
 * an order has been paid, but that supplier has not finished connecting the
 * account they get paid into. The obligation is correct, the money is held, and
 * the only thing missing is on their side — possibly for days.
 *
 * 🔴 It used to be handled by making `order.paid` throw so the outbox would
 * retry. That re-ran every OTHER handler too, so the customer was emailed their
 * confirmation once per attempt. Four identical emails on 2026-08-28 before it
 * was stopped by hand. A handler must not charge its neighbours for its own
 * incompleteness.
 *
 * ⚠️ It also could not have worked: the outbox gives up after eight attempts, so
 * a supplier who onboarded on Wednesday would never be paid for Monday's order.
 * A sweep has no such horizon.
 *
 * 🔑 Safe to run as often as you like. `settleSupplierPayment` claims each row
 * before calling the provider, the idempotency key is derived from the purchase
 * order, and the unique index on `purchase_order_id` is the final guarantee.
 */

/** Bounded so a backlog cannot hold the worker for an unbounded time. */
const BATCH = 25;

export type SweepResult = {
	considered: number;
	settled: number;
	stillWaiting: number;
	failed: number;
};

export async function settlePendingSupplierPayments(options?: {
	batchSize?: number;
	transferer?: SupplierTransferer;
	log?: (message: string, detail: Record<string, unknown>) => void;
}): Promise<SweepResult> {
	const log = options?.log ?? (() => {});
	const [
		{ settleSupplierPayment },
		payments,
		{ and, db, eq, orders, quickengineWorkspaces, supplierPayments },
	] = await Promise.all([
		import("@quickengine/mod-inventory"),
		import("@quickengine/mod-payments"),
		import("@quickengine/db"),
	]);
	const transfer = options?.transferer ?? payments.sendSupplierTransfer;

	/**
	 * ⚠️ `calculated` only, deliberately.
	 *
	 * `initiated` means the provider may already be holding the transfer and the
	 * result was never written down — retrying that blindly is how a supplier is
	 * paid twice. Those need reconciliation against the provider, which is a
	 * different job with a different answer.
	 */
	const due = await db
		.select({
			id: supplierPayments.id,
			workspaceId: supplierPayments.workspaceId,
			orderId: supplierPayments.orderId,
		})
		.from(supplierPayments)
		.where(eq(supplierPayments.status, "calculated"))
		.limit(options?.batchSize ?? BATCH);

	const result: SweepResult = {
		considered: due.length,
		settled: 0,
		stillWaiting: 0,
		failed: 0,
	};

	for (const row of due) {
		try {
			/**
			 * The label the supplier reads. Rebuilt here rather than stored, so it
			 * always names the business and order as they are now — and so a
			 * settlement days late still says what it is for.
			 */
			const [workspace] = await db
				.select({ name: quickengineWorkspaces.name })
				.from(quickengineWorkspaces)
				.where(eq(quickengineWorkspaces.id, row.workspaceId))
				.limit(1);
			const [order] = row.orderId
				? await db
						.select({ number: orders.number })
						.from(orders)
						.where(
							and(
								eq(orders.id, row.orderId),
								eq(orders.workspaceId, row.workspaceId),
							),
						)
						.limit(1)
				: [];

			const outcome = await settleSupplierPayment(
				row.workspaceId,
				row.id,
				transfer,
				{
					description: `${workspace?.name ?? "Order"} — Order ${
						order?.number ?? row.orderId ?? ""
					} supplier settlement`.trim(),
				},
			);

			if (outcome.settled) {
				result.settled += 1;
				continue;
			}
			/**
			 * ⚠️ Still waiting is the NORMAL outcome here, not an error. A supplier
			 * mid-onboarding will answer this way every cycle until they finish,
			 * and logging that as a failure would bury the ones that are.
			 */
			if (outcome.retryable) {
				result.stillWaiting += 1;
			} else {
				result.failed += 1;
				log("supplier-settlement-sweep.refused", {
					supplierPaymentId: row.id,
					workspaceId: row.workspaceId,
					reason: outcome.reason,
				});
			}
		} catch (error) {
			// One obligation must never stop the rest of the batch.
			result.failed += 1;
			log("supplier-settlement-sweep.failed", {
				error,
				supplierPaymentId: row.id,
				workspaceId: row.workspaceId,
			});
		}
	}

	return result;
}
