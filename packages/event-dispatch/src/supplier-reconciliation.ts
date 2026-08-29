/**
 * Ask the provider what actually happened to money we sent a supplier.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Two states could not be resolved without it, and both cost a real supplier
 * real money.
 *
 * **`initiated` with no transfer id.** The settlement asked the provider to move
 * money and never heard back. The transfer may have been made — the supplier may
 * already be paid — or the request may never have landed. `settlePendingSupplierPayments`
 * deliberately refuses to touch these, because retrying one that already worked
 * pays a supplier twice out of the business's own pocket. The only honest answer
 * is to ask the provider what it holds, matched on the payment id we wrote into
 * the transfer's metadata.
 *
 * **`succeeded`, quietly reversed.** A transfer can be taken back after the fact:
 * a disputed source charge, a platform balance recovered. We wrote `succeeded`
 * once and never looked again, so the supplier was unpaid while our books said
 * otherwise, and nothing anywhere would ever have said different.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 *
 * ⚠️ It never SENDS money. Every path here reads from the provider and writes
 * our own record straight. Paying is the sweep's job, and keeping the two apart
 * is what stops a reconciliation bug becoming a double payment.
 *
 * ⚠️ It never resolves a discrepancy. A row whose amounts disagree is held for a
 * person on purpose — both automatic answers are wrong in a way the supplier
 * notices.
 */

/** Bounded so a backlog cannot hold the worker for an unbounded time. */
const BATCH = 50;

/**
 * How long a settlement is given to write its own result before this pass goes
 * looking for it. Anything younger is probably still in flight, and adopting a
 * transfer out from under a running settlement helps nobody.
 */
const UNCERTAIN_AFTER_MS = 2 * 60 * 1000;

export type ReconciliationResult = {
	considered: number;
	/** Rows whose transfer we found and recorded for the first time. */
	adopted: number;
	/** Rows the provider confirmed as paid and not taken back. */
	confirmed: number;
	/** Rows the provider says were reversed, in whole or in part. */
	reversed: number;
	/** Rows with no transfer at the provider at all. */
	missing: number;
};

export async function reconcileSupplierPayments(options?: {
	batchSize?: number;
	log?: (message: string, detail: Record<string, unknown>) => void;
	/** Injected in tests so nothing opens a socket. */
	reader?: typeof import("@quickengine/mod-payments").readSupplierTransfer;
	finder?: typeof import("@quickengine/mod-payments").findSupplierTransferByPaymentId;
	now?: () => Date;
}): Promise<ReconciliationResult> {
	const log = options?.log ?? (() => {});
	const now = options?.now ?? (() => new Date());
	const [payments, db] = await Promise.all([
		import("@quickengine/mod-payments"),
		import("@quickengine/db"),
	]);
	const read = options?.reader ?? payments.readSupplierTransfer;
	const find = options?.finder ?? payments.findSupplierTransferByPaymentId;
	const {
		and,
		db: database,
		eq,
		isNotNull,
		lt,
		or,
		supplierPayments,
		supplierPaymentAccounts,
	} = db;

	const result: ReconciliationResult = {
		considered: 0,
		adopted: 0,
		confirmed: 0,
		reversed: 0,
		missing: 0,
	};

	/**
	 * ⚠️ `succeeded` is included, not just `initiated`.
	 *
	 * A settled transfer is exactly the one that can be reversed later, so a pass
	 * that only looked at uncertain rows would never notice the case it was
	 * written for.
	 */
	const rows = await database
		.select({
			id: supplierPayments.id,
			workspaceId: supplierPayments.workspaceId,
			supplierId: supplierPayments.supplierId,
			status: supplierPayments.status,
			environment: supplierPayments.environment,
			amountCents: supplierPayments.amountCents,
			reversedCents: supplierPayments.reversedCents,
			externalTransferId: supplierPayments.externalTransferId,
			createdAt: supplierPayments.createdAt,
		})
		.from(supplierPayments)
		.where(
			or(
				and(
					eq(supplierPayments.status, "initiated"),
					lt(
						supplierPayments.createdAt,
						new Date(now().getTime() - UNCERTAIN_AFTER_MS),
					),
				),
				and(
					eq(supplierPayments.status, "succeeded"),
					isNotNull(supplierPayments.externalTransferId),
				),
			),
		)
		.limit(options?.batchSize ?? BATCH);

	for (const row of rows) {
		result.considered += 1;
		const environment = row.environment as "test" | "live";
		try {
			let state = row.externalTransferId
				? await read({
						environment,
						externalTransferId: row.externalTransferId,
					})
				: null;
			let adopted = false;

			if (!state && !row.externalTransferId) {
				// Uncertain: look for a transfer carrying this payment's id.
				const [account] = await database
					.select({
						externalAccountId: supplierPaymentAccounts.externalAccountId,
					})
					.from(supplierPaymentAccounts)
					.where(
						and(
							eq(supplierPaymentAccounts.workspaceId, row.workspaceId),
							eq(supplierPaymentAccounts.supplierId, row.supplierId),
						),
					)
					.limit(1);
				if (!account?.externalAccountId) continue;

				state = await find({
					environment,
					destinationAccountId: account.externalAccountId,
					supplierPaymentId: row.id,
					since: row.createdAt,
				});
				adopted = state !== null;
			}

			if (!state) {
				/**
				 * 🔴 Left `initiated`, never marked failed here.
				 *
				 * "Not found yet" is not "did not happen": a provider can be briefly
				 * inconsistent, and writing `failed` would free the sweep to send the
				 * money a second time. A person decides, and the count below is how
				 * they find out there is something to decide.
				 */
				if (!row.externalTransferId) {
					result.missing += 1;
					log("supplier-reconciliation.not-found", {
						supplierPaymentId: row.id,
						workspaceId: row.workspaceId,
						note: "left initiated; a transfer may still exist",
					});
				}
				continue;
			}

			const fullyReversed = state.reversedCents >= state.amountCents;
			await database
				.update(supplierPayments)
				.set({
					status: fullyReversed ? "reversed" : "succeeded",
					externalTransferId: state.externalTransferId,
					reversedCents: state.reversedCents,
					...(fullyReversed ? { reversedAt: now() } : {}),
					...(adopted ? { succeededAt: now() } : {}),
					updatedAt: now(),
				})
				.where(eq(supplierPayments.id, row.id));

			if (adopted) {
				result.adopted += 1;
				log("supplier-reconciliation.adopted", {
					supplierPaymentId: row.id,
					externalTransferId: state.externalTransferId,
				});
			}

			if (state.reversedCents > (row.reversedCents ?? 0)) {
				result.reversed += 1;
				log("supplier-reconciliation.reversed", {
					supplierPaymentId: row.id,
					externalTransferId: state.externalTransferId,
					reversedCents: state.reversedCents,
				});
			} else if (!adopted) {
				result.confirmed += 1;
			}
		} catch (error) {
			// One unreadable row must not stop the pass; the next run tries again.
			log("supplier-reconciliation.failed", {
				supplierPaymentId: row.id,
				error,
			});
		}
	}

	return result;
}
