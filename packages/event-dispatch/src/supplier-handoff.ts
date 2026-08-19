import type { OutboxEvent, OutboxHandler } from "@quickengine/events";
import {
	markPurchaseOrderSent,
	type RaisedPurchaseOrder,
	raisePurchaseOrdersForOrder,
} from "@quickengine/mod-inventory";

/**
 * Routing a paid order to whoever actually ships it.
 *
 * ── Why this hangs off `order.paid` ──────────────────────────────────────────
 *
 * 🔴 Not `order.created`. A supplier asked to ship against an unpaid order is a
 * business paying for coffee somebody abandoned at the card form — which,
 * tonight, is not hypothetical: ORD-0002 was abandoned at exactly that step.
 * Money first, then the ask.
 *
 * ── Why email first, and why it may refuse to send ───────────────────────────
 *
 * ⚠️ The purchase order is written whatever happens; only the NOTIFYING varies
 * by `handoffMethod`. So a supplier whose method is still `unknown` produces a
 * real record sitting in `draft` for a human to act on, rather than nothing at
 * all — which is the correct state for EZPZ right now, because Liam has not yet
 * said how he wants orders submitted.
 *
 * 🔴 **Fails closed on the sender.** Supplier mail must go from the workspace's
 * OWN verified domain and never from QuickDash — a purchase order arriving from
 * a vendor the supplier has never heard of exposes the retailer's stack in the
 * middle of their supply chain. With no verified sender the purchase order is
 * marked for manual handoff instead of quietly going out under our name. That
 * silent fallback would fire on somebody's first order, when they are not
 * watching.
 */

function renderPurchaseOrder(purchaseOrder: RaisedPurchaseOrder) {
	const lines = purchaseOrder.lines
		.map(
			(line) =>
				`  ${line.quantity} x ${line.supplierSku}  (${line.description})`,
		)
		.join("\n");

	return [
		`Purchase order ${purchaseOrder.number}`,
		"",
		lines,
		"",
		"Please confirm receipt and send a tracking number when it ships.",
	].join("\n");
}

export function supplierHandoffHandler(
	log: (message: string, detail: Record<string, unknown>) => void = (
		message,
		detail,
	) => console.error(message, detail),
): OutboxHandler {
	return {
		name: "supplier-handoff",
		async handle(event: OutboxEvent) {
			// Cheapest possible rejection, before any database work.
			if (event.eventName !== "order.paid") return;

			const orderId =
				(event.payload as { orderId?: string } | null)?.orderId ??
				event.aggregateId;
			if (!orderId) return;

			let raised: RaisedPurchaseOrder[];
			try {
				// Safe to call twice: the unique constraint on (order, supplier) makes
				// an at-least-once redelivery a no-op rather than a second order.
				raised = await raisePurchaseOrdersForOrder({
					workspaceId: event.workspaceId,
					orderId,
				});
			} catch (error) {
				log("supplier-handoff.raise_failed", {
					error,
					eventId: event.id,
					orderId,
				});
				throw error;
			}

			for (const purchaseOrder of raised) {
				if (purchaseOrder.handoffMethod !== "email") {
					// Deliberately left in `draft`. A method nobody has agreed yet is a
					// record for a human, not a guess about where to send it.
					continue;
				}

				const to = purchaseOrder.handoffTarget ?? purchaseOrder.contactEmail;
				if (!to) {
					await markPurchaseOrderSent({
						workspaceId: event.workspaceId,
						purchaseOrderId: purchaseOrder.id,
						failureReason: "No address to send this supplier's orders to.",
					});
					continue;
				}

				try {
					const { getEmailProvider } = await import("@quickengine/email");
					const { resolveBrand, usesPlatformSupportEmail } = await import(
						"@quickengine/db"
					);
					const brand = await resolveBrand(event.workspaceId);

					/**
					 * 🔴 The fail-closed gate. Without a verified sending domain the
					 * only address available is ours, and a supplier must never receive
					 * a purchase order from QuickDash on a business's behalf.
					 */
					if (!brand || usesPlatformSupportEmail(brand)) {
						await markPurchaseOrderSent({
							workspaceId: event.workspaceId,
							purchaseOrderId: purchaseOrder.id,
							failureReason:
								"No verified sending domain, so this was not sent. Verify your domain, then send it by hand.",
						});
						continue;
					}

					const body = renderPurchaseOrder(purchaseOrder);
					await getEmailProvider().send({
						to,
						subject: `Purchase order ${purchaseOrder.number} from ${brand.name}`,
						// Plain text on purpose: a purchase order is read by somebody
						// keying it into their own system, and no branding of ours belongs
						// anywhere near it.
						html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${body}</pre>`,
						text: body,
					});
					await markPurchaseOrderSent({
						workspaceId: event.workspaceId,
						purchaseOrderId: purchaseOrder.id,
					});
				} catch (error) {
					// The purchase order exists either way; the send is what failed, and
					// saying so on the record is more useful than retrying the whole
					// event and re-raising orders that already landed.
					log("supplier-handoff.send_failed", {
						error,
						purchaseOrderId: purchaseOrder.id,
					});
					await markPurchaseOrderSent({
						workspaceId: event.workspaceId,
						purchaseOrderId: purchaseOrder.id,
						failureReason: "The purchase order could not be emailed.",
					});
				}
			}
		},
	};
}
