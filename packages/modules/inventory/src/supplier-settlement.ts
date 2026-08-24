import {
	and,
	db,
	eq,
	inArray,
	purchaseOrderLines,
	purchaseOrders,
	supplierPaymentAccounts,
	supplierPaymentEvents,
	supplierPayments,
	supplierSkus,
} from "@quickengine/db";

/**
 * What a workspace owes its supplier for one purchase order, recorded so it can
 * be settled without anybody sending an invoice.
 *
 * ── Why this is a ledger and not a job ───────────────────────────────────────
 *
 * 🔴 Money movement fails in ways a queue cannot describe. A provider can accept
 * a transfer and the process asking for it can die before writing that down. A
 * webhook can arrive twice. A transfer can be reversed weeks later when a
 * customer disputes the sale that caused it. None of those are "retry the job" —
 * they are states an obligation can be in, and they have to survive a restart.
 *
 * 🔑 The amount comes from the PURCHASE ORDER's own snapshot. Not from retail,
 * which is the shop's business and not the supplier's; and not from today's SKU
 * cost, which would let a price change reach backwards into orders already
 * placed and agreed.
 */

export class SupplierSettlementError extends Error {}

export type SupplierObligation = {
	purchaseOrderId: string;
	supplierId: string;
	amountCents: number;
	currency: string;
};

/**
 * Add up what a purchase order actually commits the workspace to.
 *
 * ⚠️ Refuses rather than guesses when a line has no cost. A supplier SKU without
 * a `unitCostCents` means nobody has agreed a price for that item — settling it
 * at zero would quietly underpay, and settling it at retail would overpay. Both
 * are worse than saying so.
 *
 * ⚠️ Refuses a purchase order whose lines are in more than one currency. There
 * is no correct single transfer for that, and converting silently would invent
 * an exchange rate nobody agreed to.
 */
export async function purchaseOrderObligation(
	workspaceId: string,
	purchaseOrderId: string,
): Promise<SupplierObligation> {
	const [po] = await db
		.select()
		.from(purchaseOrders)
		.where(
			and(
				eq(purchaseOrders.workspaceId, workspaceId),
				eq(purchaseOrders.id, purchaseOrderId),
			),
		)
		.limit(1);
	if (!po) throw new SupplierSettlementError("PURCHASE_ORDER_NOT_FOUND");

	const lines = await db
		.select()
		.from(purchaseOrderLines)
		.where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
	if (lines.length === 0) {
		throw new SupplierSettlementError("PURCHASE_ORDER_HAS_NO_LINES");
	}

	let amountCents = 0;
	const currencies = new Set<string>();
	for (const line of lines) {
		if (line.unitCostCents == null) {
			throw new SupplierSettlementError("SUPPLIER_COST_NOT_AGREED");
		}
		currencies.add(line.currency.toUpperCase());
		amountCents += line.unitCostCents * line.quantity;
	}
	if (currencies.size > 1) {
		throw new SupplierSettlementError("PURCHASE_ORDER_MIXED_CURRENCY");
	}
	if (amountCents <= 0) {
		throw new SupplierSettlementError("SUPPLIER_OWED_NOTHING");
	}

	return {
		purchaseOrderId,
		supplierId: po.supplierId,
		amountCents,
		currency: [...currencies][0] as string,
	};
}

/**
 * Record the obligation, once.
 *
 * 🔴 Returns the EXISTING row when there already is one, rather than raising a
 * second. `order.paid` is redelivered by the outbox up to eight times, and a
 * settlement that appeared once per delivery would pay a supplier eight times
 * for one sale. The unique index on `purchase_order_id` is the real guarantee;
 * this is the part that behaves gracefully when it fires.
 *
 * ⚠️ Records only. Nothing here moves money — that is deliberate, so this can
 * run inside the same transaction that settles the order without a payment
 * provider's availability deciding whether an order is allowed to complete.
 */
export async function recordSupplierObligation(input: {
	workspaceId: string;
	purchaseOrderId: string;
	orderId?: string | null;
	environment: "test" | "live";
}): Promise<{ id: string; created: boolean; amountCents: number }> {
	const obligation = await purchaseOrderObligation(
		input.workspaceId,
		input.purchaseOrderId,
	);

	/**
	 * 🔑 Derived, not random, and stored BEFORE anything is sent.
	 *
	 * A key invented at call time protects nothing: the crash this defends
	 * against happens between a provider succeeding and the result being written,
	 * and a retry that mints a fresh key asks for a second, different payment.
	 * Deriving it from the purchase order means every retry presents the same one.
	 */
	const idempotencyKey = `supplier-payment:${input.purchaseOrderId}`;

	const [row] = await db
		.insert(supplierPayments)
		.values({
			workspaceId: input.workspaceId,
			supplierId: obligation.supplierId,
			purchaseOrderId: input.purchaseOrderId,
			orderId: input.orderId ?? null,
			amountCents: obligation.amountCents,
			currency: obligation.currency,
			environment: input.environment,
			status: "calculated",
			idempotencyKey,
		})
		.onConflictDoNothing({ target: supplierPayments.purchaseOrderId })
		.returning();

	if (row) {
		await db.insert(supplierPaymentEvents).values({
			supplierPaymentId: row.id,
			workspaceId: input.workspaceId,
			kind: "calculated",
			actor: "system",
			detail: `${obligation.amountCents} ${obligation.currency} from purchase order snapshot`,
		});
		return { id: row.id, created: true, amountCents: row.amountCents };
	}

	const [existing] = await db
		.select()
		.from(supplierPayments)
		.where(eq(supplierPayments.purchaseOrderId, input.purchaseOrderId))
		.limit(1);
	if (!existing) throw new SupplierSettlementError("OBLIGATION_LOST");
	return {
		id: existing.id,
		created: false,
		amountCents: existing.amountCents,
	};
}

/**
 * Whether an obligation may actually be sent yet.
 *
 * 🔴 Every one of these is a way to pay somebody who should not be paid, and
 * each has to be checked against stored state rather than trusted from a caller.
 * The amount especially: a request that names its own figure is a request to be
 * robbed.
 */
export async function settlementEligibility(
	workspaceId: string,
	supplierPaymentId: string,
): Promise<
	| { eligible: true; amountCents: number; destinationAccountId: string }
	| { eligible: false; reason: string }
> {
	const [payment] = await db
		.select()
		.from(supplierPayments)
		.where(
			and(
				eq(supplierPayments.workspaceId, workspaceId),
				eq(supplierPayments.id, supplierPaymentId),
			),
		)
		.limit(1);
	if (!payment) return { eligible: false, reason: "OBLIGATION_NOT_FOUND" };

	if (payment.status === "succeeded") {
		return { eligible: false, reason: "ALREADY_SETTLED" };
	}
	if (payment.status === "initiated") {
		// ⚠️ Never retried automatically. The provider may already be holding a
		// request; reconciliation decides, not a worker.
		return { eligible: false, reason: "IN_FLIGHT" };
	}
	if (payment.status === "cancelled" || payment.status === "reversed") {
		return { eligible: false, reason: "NO_LONGER_OWED" };
	}

	const [account] = await db
		.select()
		.from(supplierPaymentAccounts)
		.where(
			and(
				eq(supplierPaymentAccounts.supplierId, payment.supplierId),
				eq(supplierPaymentAccounts.environment, payment.environment),
			),
		)
		.limit(1);
	if (!account) return { eligible: false, reason: "SUPPLIER_NOT_ONBOARDED" };
	if (account.transfersEnabled !== "yes") {
		return { eligible: false, reason: "SUPPLIER_CANNOT_RECEIVE_YET" };
	}
	if (account.status !== "active") {
		return { eligible: false, reason: "SUPPLIER_ACCOUNT_NOT_ACTIVE" };
	}

	return {
		eligible: true,
		amountCents: payment.amountCents,
		destinationAccountId: account.externalAccountId,
	};
}

/**
 * What suppliers will be owed for a basket, before the order exists.
 *
 * ── Why this has to happen at checkout ───────────────────────────────────────
 *
 * 🔴 Stripe fixes the application fee when the charge is CREATED. The purchase
 * order is not raised until the order is paid — after the money has moved — so
 * the amount to hold back cannot come from the purchase order. It has to be
 * computed from the same rows the purchase order will snapshot moments later.
 *
 * ⚠️ Returns ZERO for a basket with no supplier-backed lines, which is the
 * normal case for most workspaces. A shop that holds its own stock never has an
 * application fee and nothing about its charge changes.
 *
 * ⚠️ Refuses nothing. A line whose supplier has no agreed cost is skipped here
 * rather than blocking a sale — the purchase order will refuse it later, when
 * refusing costs a person an alert instead of costing the shop a customer.
 */
export async function checkoutSupplierObligation(input: {
	workspaceId: string;
	currency: string;
	lines: ReadonlyArray<{ catalogItemId: string; quantity: number }>;
}): Promise<{ totalCents: number; bySupplier: Map<string, number> }> {
	const bySupplier = new Map<string, number>();
	if (input.lines.length === 0) return { totalCents: 0, bySupplier };

	const rows = await db
		.select({
			supplierId: supplierSkus.supplierId,
			catalogItemId: supplierSkus.catalogItemId,
			unitCostCents: supplierSkus.unitCostCents,
			currency: supplierSkus.currency,
		})
		.from(supplierSkus)
		.where(
			and(
				eq(supplierSkus.workspaceId, input.workspaceId),
				inArray(
					supplierSkus.catalogItemId,
					input.lines.map((line) => line.catalogItemId),
				),
			),
		);

	const costByItem = new Map<string, { supplierId: string; cents: number }>();
	for (const row of rows) {
		if (row.unitCostCents == null) continue;
		/**
		 * ⚠️ A supplier priced in another currency is SKIPPED, not converted.
		 *
		 * Holding back an amount in the wrong currency would produce a transfer
		 * Stripe cannot make and a supplier obligation nobody agreed. It becomes a
		 * manual settlement, which is the honest outcome.
		 */
		if (row.currency.toUpperCase() !== input.currency.toUpperCase()) continue;
		costByItem.set(row.catalogItemId, {
			supplierId: row.supplierId,
			cents: row.unitCostCents,
		});
	}

	let totalCents = 0;
	for (const line of input.lines) {
		const cost = costByItem.get(line.catalogItemId);
		if (!cost) continue;
		const amount = cost.cents * line.quantity;
		totalCents += amount;
		bySupplier.set(
			cost.supplierId,
			(bySupplier.get(cost.supplierId) ?? 0) + amount,
		);
	}

	return { totalCents, bySupplier };
}
