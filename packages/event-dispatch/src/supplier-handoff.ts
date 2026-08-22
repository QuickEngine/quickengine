import type { OutboxEvent, OutboxHandler } from "@quickengine/events";
import {
	claimPurchaseOrderForDispatch,
	isAutomatedHandoff,
	markPurchaseOrderSent,
	type RaisedPurchaseOrder,
	raisePurchaseOrdersForOrder,
	recordSupplierOrderPlaced,
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

			/**
			 * 🔴 A SANDBOX order never reaches a real supplier.
			 *
			 * Supplier connections carry no mode — there is one Shopify store, one
			 * token, one Collective link — so nothing downstream can tell a test
			 * order from a real one. Without this a test checkout placed a genuine
			 * order in the business's real Shopify store, Collective routed it, and
			 * a supplier shipped actual goods for a sale that never happened.
			 *
			 * ⚠️ The purchase order is still RAISED, so the operator can see what a
			 * real order would have asked for. It is simply never sent, and says so.
			 */
			const { workspaceEnvironment } = await import("@quickengine/db");
			const environment = await workspaceEnvironment(event.workspaceId);
			if (environment === "test") {
				for (const purchaseOrder of raised) {
					await markPurchaseOrderSent({
						workspaceId: event.workspaceId,
						purchaseOrderId: purchaseOrder.id,
						failureReason:
							"This workspace is in sandbox, so nothing was sent to the supplier. Switch to live to place real orders.",
					});
				}
				log("supplier-handoff.skipped_sandbox", {
					eventId: event.id,
					orderId,
					raised: raised.length,
				});
				return;
			}

			for (const purchaseOrder of raised) {
				if (purchaseOrder.handoffMethod === "email") {
					await sendByEmail(event, purchaseOrder, log);
					continue;
				}
				if (isAutomatedHandoff(purchaseOrder.handoffMethod)) {
					await sendByAdapter(event, purchaseOrder, log);
				}
				// Deliberately left in `draft`. A method nobody has agreed yet is a
				// record for a human, not a guess about where to send it.
			}
		},
	};
}

/**
 * The email rail. Unchanged in behaviour — extracted so the switch above reads.
 */
async function sendByEmail(
	event: OutboxEvent,
	purchaseOrder: RaisedPurchaseOrder,
	log: (message: string, detail: Record<string, unknown>) => void,
) {
	// A redelivery of an order already emailed must not email it twice.
	if (purchaseOrder.alreadyExisted && purchaseOrder.status !== "draft") return;

	const to = purchaseOrder.handoffTarget ?? purchaseOrder.contactEmail;
	if (!to) {
		await markPurchaseOrderSent({
			workspaceId: event.workspaceId,
			purchaseOrderId: purchaseOrder.id,
			failureReason: "No address to send this supplier's orders to.",
		});
		return;
	}

	try {
		const { getEmailProvider } = await import("@quickengine/email");
		const { resolveBrand } = await import("@quickengine/db");
		const brand = await resolveBrand(event.workspaceId);

		/**
		 * 🔴 The fail-closed gate, and it checks the SENDER.
		 *
		 * It used to test the support address, which is only shown in a footer and
		 * says nothing about what a message is sent from — so it passed for any
		 * workspace that had filled in a support email, and then no `from` was ever
		 * passed anyway. Every purchase order would have reached a supplier from
		 * QuickEngine, on a business's behalf, to a person who has never heard of
		 * us.
		 */
		if (!brand?.sender) {
			await markPurchaseOrderSent({
				workspaceId: event.workspaceId,
				purchaseOrderId: purchaseOrder.id,
				failureReason:
					"No sending address is set for this business, so this was not sent. Set one in settings, then send it by hand.",
			});
			return;
		}

		const body = renderPurchaseOrder(purchaseOrder);
		await getEmailProvider().send({
			to,
			// 🔑 From the BUSINESS. A supplier has no relationship with the platform.
			from: brand.sender,
			// Replies go to the humans, not to the sending mailbox.
			replyTo: brand.supportEmail,
			subject: `Purchase order ${purchaseOrder.number} from ${brand.name}`,
			// Plain text on purpose: a purchase order is read by somebody keying it
			// into their own system, and no branding of ours belongs anywhere near it.
			html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${body}</pre>`,
			text: body,
		});
		await markPurchaseOrderSent({
			workspaceId: event.workspaceId,
			purchaseOrderId: purchaseOrder.id,
		});
	} catch (error) {
		// The purchase order exists either way; the send is what failed, and saying
		// so on the record is more useful than retrying the whole event and
		// re-raising orders that already landed.
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

/**
 * The automated rail: place the order in the supplier's own system.
 *
 * 🔴 **Claim first, call second.** `claimPurchaseOrderForDispatch` is a
 * conditional update, so of two workers draining the same at-least-once event
 * exactly one proceeds. Losing the claim is an ordinary outcome, not an error.
 *
 * 🔴 **Fails closed, and never falls back to email.** A supplier who agreed to
 * receive orders through their own system must not suddenly get a plain-text
 * email from a vendor they have never heard of. No connection means the purchase
 * order waits for a human and says why.
 *
 * ⚠️ **Swallows its errors deliberately.** A throwing outbox handler re-runs
 * every peer handler, replaying activity, realtime, search and both mail paths
 * for an event that already succeeded at all of them. The cost is that a
 * `failed` purchase order is only retried on a later redelivery of the same
 * `order.paid`, and the outbox stops at eight attempts — so an outage longer
 * than that strands it. Accepted: a stranded order is visible, a silent double
 * order is not. Recorded in `TECH_DEBT.md`.
 */
async function sendByAdapter(
	event: OutboxEvent,
	purchaseOrder: RaisedPurchaseOrder,
	log: (message: string, detail: Record<string, unknown>) => void,
) {
	const claimed = await claimPurchaseOrderForDispatch({
		workspaceId: event.workspaceId,
		purchaseOrderId: purchaseOrder.id,
	});
	if (!claimed) return;

	try {
		const { getSupplierAdapter, resolveSupplierConnection } = await import(
			"@quickengine/mod-inventory"
		);
		const connection = await resolveSupplierConnection({
			workspaceId: event.workspaceId,
			supplierId: purchaseOrder.supplierId,
			provider: purchaseOrder.handoffMethod,
		});
		if (!connection) {
			await markPurchaseOrderSent({
				workspaceId: event.workspaceId,
				purchaseOrderId: purchaseOrder.id,
				failureReason:
					"This supplier is not connected, so nothing was sent. Connect them, then send this by hand.",
			});
			return;
		}

		const placement = await getSupplierAdapter(
			purchaseOrder.handoffMethod,
		).placeOrder({
			connection,
			// Derived from the purchase order, so it is identical on every retry —
			// which is what lets the adapter recognise an order it already placed.
			correlationKey: `qd-po-${purchaseOrder.id}`,
			purchaseOrderNumber: purchaseOrder.number,
			lines: purchaseOrder.lines.map((line) => ({
				supplierSku: line.supplierSku,
				quantity: line.quantity,
				description: line.description,
			})),
			shipTo: {
				name: claimed.shipToName,
				line1: claimed.shipToLine1,
				line2: claimed.shipToLine2,
				city: claimed.shipToCity,
				region: claimed.shipToRegion,
				postalCode: claimed.shipToPostalCode,
				countryCode: claimed.shipToCountryCode,
			},
			currency: purchaseOrder.lines[0]?.currency ?? "USD",
		});

		await recordSupplierOrderPlaced({
			workspaceId: event.workspaceId,
			purchaseOrderId: purchaseOrder.id,
			externalOrderId: placement.externalOrderId,
			externalOrderNumber: placement.externalOrderNumber,
			metadata: {
				provider: purchaseOrder.handoffMethod,
				shopDomain: connection.shopDomain,
				apiVersion: connection.apiVersion,
				correlated: placement.correlated,
			},
		});
	} catch (error) {
		log("supplier-handoff.place_failed", {
			error,
			purchaseOrderId: purchaseOrder.id,
			supplierId: purchaseOrder.supplierId,
		});
		await markPurchaseOrderSent({
			workspaceId: event.workspaceId,
			purchaseOrderId: purchaseOrder.id,
			failureReason: "The supplier's system did not accept this order.",
		});
	}
}
