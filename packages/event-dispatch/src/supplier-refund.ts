import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * How the supplier is actually told. Injected so the path can be asserted —
 * it was broken for a week and no test could have noticed.
 */
export type SupplierNotifier = (input: {
	to: string;
	from?: string;
	replyTo?: string;
	subject: string;
	html: string;
	text: string;
}) => Promise<unknown>;

/**
 * The customer's money went back. Pull the supplier's share back to match.
 *
 * ── The loss this prevents ───────────────────────────────────────────────────
 *
 * 🔴 Refunding a customer in full while the supplier keeps their share takes the
 * difference out of the BUSINESS's own balance. On a $26.46 order with a $15.00
 * supplier cost, a full refund cost Caffeinate $15.00 of its own money and
 * nothing anywhere said why. The supplier had already been paid automatically,
 * so the faster the settlement rail worked, the more the refund hurt.
 *
 * ── Why proportional ─────────────────────────────────────────────────────────
 *
 * ⚠️ A customer refunded half their order does not undo the whole supplier
 * obligation. The share pulled back is this refund's fraction of what the
 * customer actually paid, floored so repeated partial refunds can never reverse
 * more than was sent. `unwindSupplierPayment` caps it again at what is left.
 *
 * ── What cannot be recovered ─────────────────────────────────────────────────
 *
 * 🔑 Once the provider has paid the money out to the supplier's bank, no API
 * gets it back. That is reported as owed back rather than silently swallowed,
 * because it becomes a conversation with the supplier and somebody has to know
 * to have it.
 */
export function supplierRefundHandler(
	log: (message: string, detail: Record<string, unknown>) => void = (
		message,
		detail,
	) => console.error(message, detail),
	reverser?: (input: {
		environment: "test" | "live";
		externalTransferId: string;
		amountCents: number;
		idempotencyKey: string;
		reason: string;
	}) => Promise<{ reversedCents: number }>,
	notify?: SupplierNotifier,
): OutboxHandler {
	return {
		name: "supplier-refund",
		async handle(event: OutboxEvent) {
			// Cheapest possible rejection, before any database work.
			if (event.eventName !== "payment.refunded") return;

			const payload = event.payload as {
				refundId?: string;
				paymentId?: string;
			} | null;
			const refundId = payload?.refundId;
			if (!refundId) return;

			const [{ unwindSupplierPayment }, payments_, dbm] = await Promise.all([
				import("@quickengine/mod-inventory"),
				import("@quickengine/mod-payments"),
				import("@quickengine/db"),
			]);
			const { and, db, eq, paymentRefunds, payments, purchaseOrders } = dbm;
			const reverse = reverser ?? payments_.reverseSupplierTransfer;

			/**
			 * 🔴 Scoped to the EVENT's workspace, not just the id.
			 *
			 * A handler runs with no session: an id inside a payload is a claim,
			 * not a fact. Looking a refund up by id alone would let a wrong id
			 * reach across a tenant boundary with nothing there to refuse it.
			 */
			const [refund] = await db
				.select({
					amountCents: paymentRefunds.amountCents,
					paymentId: paymentRefunds.paymentId,
				})
				.from(paymentRefunds)
				.where(
					and(
						eq(paymentRefunds.workspaceId, event.workspaceId),
						eq(paymentRefunds.id, refundId),
					),
				)
				.limit(1);
			if (!refund) return;

			const [payment] = await db
				.select({
					orderId: payments.orderId,
					amountCents: payments.amountCents,
				})
				.from(payments)
				.where(
					and(
						eq(payments.workspaceId, event.workspaceId),
						eq(payments.id, refund.paymentId),
					),
				)
				.limit(1);
			// A refund against an invoice with no order commits no supplier.
			if (!payment?.orderId || payment.amountCents <= 0) return;

			const { suppliers } = dbm;
			const pos = await db
				.select({
					id: purchaseOrders.id,
					number: purchaseOrders.number,
					status: purchaseOrders.status,
					handoffMethod: purchaseOrders.handoffMethod,
					handoffTarget: purchaseOrders.handoffTarget,
					supplierName: suppliers.name,
					supplierEmail: suppliers.contactEmail,
					sandboxHandoffEnabled: suppliers.sandboxHandoffEnabled,
				})
				.from(purchaseOrders)
				.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
				.where(
					and(
						eq(purchaseOrders.workspaceId, event.workspaceId),
						eq(purchaseOrders.orderId, payment.orderId),
					),
				);
			if (pos.length === 0) return;

			for (const po of pos) {
				try {
					const result = await unwindSupplierPayment({
						workspaceId: event.workspaceId,
						purchaseOrderId: po.id,
						/**
						 * This refund's share of what the customer paid, applied to what
						 * the supplier was sent. Floored: reversing a cent more than was
						 * sent is a provider error, and reversing a cent less is a
						 * rounding difference an operator can see and settle.
						 */
						refundedCents: await supplierShare({
							db,
							eq,
							workspaceId: event.workspaceId,
							purchaseOrderId: po.id,
							refundCents: refund.amountCents,
							paymentCents: payment.amountCents,
						}),
						reason: `Customer refund ${refundId}`,
						reverse,
					});

					/**
					 * 🔴 Tell the supplier BEFORE anything else.
					 *
					 * Their money has just been pulled back, and until this existed
					 * nothing told them the order was off. A supplier could roast, bag
					 * and ship coffee for a sale that no longer exists, having already
					 * had the payment reversed — out the goods AND the money, and the
					 * first they would hear of it is an invoice nobody pays.
					 */
					await tellSupplier(event.workspaceId, po, refundId, log, notify);

					if (result.outcome === "unrecoverable") {
						/**
						 * ⚠️ Loud on purpose. The money is gone from the platform's reach
						 * and the business is owed it back by the supplier. Nothing
						 * automatic can fix this, so it must not look like it worked.
						 */
						log("supplier-refund.unrecoverable", {
							eventId: event.id,
							purchaseOrderId: po.id,
							owedBackCents: result.owedBackCents,
							reason: result.reason,
						});
					}
				} catch (error) {
					/**
					 * ⚠️ Swallowed per purchase order, never rethrown.
					 *
					 * The customer's refund has already left; nothing here can undo it,
					 * and throwing would redeliver `payment.refunded` and re-run the
					 * restock alongside it. A supplier reversal that failed is recorded
					 * on the payment's own event log for an operator to act on.
					 */
					log("supplier-refund.failed", {
						error,
						eventId: event.id,
						purchaseOrderId: po.id,
					});
				}
			}
		},
	};
}

/**
 * How much of the SUPPLIER's money this refund accounts for.
 *
 * 🔴 Not the refund amount. The customer paid retail and the supplier was sent
 * cost; passing the refund straight through would try to pull back far more
 * than was ever sent on a full refund, and the wrong amount on a partial one.
 */
async function supplierShare(input: {
	db: typeof import("@quickengine/db").db;
	eq: typeof import("@quickengine/db").eq;
	workspaceId: string;
	purchaseOrderId: string;
	refundCents: number;
	paymentCents: number;
}): Promise<number> {
	const { supplierPayments } = await import("@quickengine/db");
	const [row] = await input.db
		.select({ amountCents: supplierPayments.amountCents })
		.from(supplierPayments)
		.where(input.eq(supplierPayments.purchaseOrderId, input.purchaseOrderId))
		.limit(1);
	if (!row) return 0;
	// A full refund reverses the whole obligation without depending on rounding.
	if (input.refundCents >= input.paymentCents) return row.amountCents;
	return Math.floor((row.amountCents * input.refundCents) / input.paymentCents);
}

/**
 * Tell a supplier an order they were asked to make is off.
 *
 * ── Why this is not optional ─────────────────────────────────────────────────
 *
 * 🔴 The refund has already reversed their payment. Without this they keep the
 * purchase order, roast and ship it, and discover weeks later that the money
 * came back. They are out the goods and the money, and the only thing that went
 * wrong is that nobody told them.
 *
 * ── What it deliberately does not do ─────────────────────────────────────────
 *
 * ⚠️ Never sent for a purchase order that was never sent. A supplier who never
 * received the order does not need to be told it is cancelled — that is noise
 * about something they never knew existed, including every sandbox rehearsal
 * that was withheld.
 *
 * ⚠️ Swallows its own failures. The money has already moved; a mail outage must
 * not make the refund handler look like it failed and re-run.
 */
async function tellSupplier(
	workspaceId: string,
	po: {
		id: string;
		number: string;
		status: string;
		handoffMethod: string;
		handoffTarget: string | null;
		supplierName: string;
		supplierEmail: string | null;
		sandboxHandoffEnabled: boolean;
	},
	refundId: string,
	log: (message: string, detail: Record<string, unknown>) => void,
	notify?: SupplierNotifier,
): Promise<void> {
	// Only email suppliers who are emailed in the first place.
	if (po.handoffMethod !== "email") return;
	// 🔑 It never reached them, so there is nothing to take back.
	if (po.status === "draft" || po.status === "skipped_sandbox") return;

	const to = po.handoffTarget ?? po.supplierEmail;
	if (!to) return;

	try {
		const [emails, { resolveBrand }] = await Promise.all([
			import("@quickengine/email"),
			import("@quickengine/db"),
		]);
		const send = notify ?? emails.getEmailProvider().send;
		/**
		 * 🔴 The workspace is PASSED IN, not dug out of the row.
		 *
		 * This read `po.workspaceId` through a cast, and the query never selected
		 * that column — so it was `undefined`, `resolveBrand` returned null, and
		 * the function returned silently. A supplier was never told an order was
		 * cancelled, and nothing anywhere said so. The cast is what stopped the
		 * type checker seeing it; the fix is to stop lying to it.
		 */
		const brand = await resolveBrand(workspaceId);
		// Fails closed on the sender, exactly as the purchase order does: a
		// supplier has no relationship with the platform and must never be
		// emailed as it.
		if (!brand?.sender) return;

		const body = [
			`Order ${po.number} has been canceled.`,
			"",
			"The customer has been refunded, so please do not make or ship this order.",
			"If it has already gone out, reply to this email and we will sort it out.",
			"",
			`Reference: ${refundId}`,
		].join("\n");

		await send({
			to,
			from: brand.sender,
			replyTo: brand.supportEmail,
			subject: `Canceled: purchase order ${po.number} from ${brand.name}`,
			html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${body}</pre>`,
			text: body,
		});
	} catch (error) {
		log("supplier-refund.notice_failed", {
			error,
			purchaseOrderId: po.id,
		});
	}
}
