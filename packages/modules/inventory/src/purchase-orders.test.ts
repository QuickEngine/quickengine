import { db } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	claimPurchaseOrderForDispatch,
	listPurchaseOrders,
	markPurchaseOrderShippedInTx,
	raisePurchaseOrdersForOrder,
	recordSupplierOrderPlaced,
} from "./purchase-orders";

const ownerId = "po-owner";
const workspaceId = "00000000-0000-4000-8000-0000000015a1";
const roastedId = "00000000-0000-4000-8000-0000000015b1";
const ownStockId = "00000000-0000-4000-8000-0000000015b2";
const supplierId = "00000000-0000-4000-8000-0000000015c1";
const orderId = "00000000-0000-4000-8000-0000000015d1";
const roastedLineId = "00000000-0000-4000-8000-0000000015e1";
const ownStockLineId = "00000000-0000-4000-8000-0000000015e2";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'PO Owner', 'po@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'PO Workspace', 'ecommerce')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status)
		values
			(${roastedId}, ${workspaceId}, 'Ethiopia Guji', 'physical', 'active'),
			(${ownStockId}, ${workspaceId}, 'Branded Mug', 'physical', 'active')
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, contact_email, handoff_method)
		values (${supplierId}, ${workspaceId}, 'EZPZ Coffee', 'liam@example.com', 'email')
	`;
	// Only the coffee is dropshipped. The mug is held in the business's own stock
	// and deliberately has no supplier mapping.
	await sql`
		insert into supplier_skus
			(workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values (${workspaceId}, ${supplierId}, ${roastedId}, 'EZPZ-ETH-250', 1500, 'CAD')
	`;
	await sql`
		insert into orders
			(id, workspace_id, client_name, sequence, number, status,
			 subtotal_cents, total_cents, currency,
			 ship_to_name, ship_to_line1, ship_to_city, ship_to_country_code)
		values (${orderId}, ${workspaceId}, 'Ada Lovelace', 9001, 'ORD-9001', 'placed',
			2400, 2400, 'CAD',
			'Ada Lovelace', '1 Hampton Crescent', 'Sylvan Lake', 'CA')
	`;
	await sql`
		insert into order_line_items
			(id, order_id, catalog_item_id, name, type, quantity,
			 unit_price_cents, line_total_cents, position)
		values
			(${roastedLineId}, ${orderId}, ${roastedId}, 'Ethiopia Guji', 'physical', 2, 1200, 2400, 0),
			(${ownStockLineId}, ${orderId}, ${ownStockId}, 'Branded Mug', 'physical', 1, 900, 900, 1)
	`;
});

describe("raising purchase orders from a paid order", () => {
	it("asks only the supplier who actually makes the thing", async () => {
		const raised = await raisePurchaseOrdersForOrder({ workspaceId, orderId });

		expect(raised).toHaveLength(1);
		expect(raised[0]).toMatchObject({
			number: "PO-0001",
			supplierName: "EZPZ Coffee",
			handoffMethod: "email",
			handoffTarget: "liam@example.com",
		});

		// 🔴 The mug is absent. A business that dropships one product and holds
		// stock of another is the normal case, and an unmapped line must be skipped
		// rather than failing the whole order or being invented onto somebody's
		// purchase order.
		expect(raised[0].lines).toEqual([
			{
				supplierSku: "EZPZ-ETH-250",
				description: "Ethiopia Guji",
				quantity: 2,
				unitCostCents: 1500,
				currency: "CAD",
			},
		]);
	});

	it("snapshots where the supplier must send it", async () => {
		await raisePurchaseOrdersForOrder({ workspaceId, orderId });
		const sql = testDbClient();
		const [row] = await sql`
			select ship_to_name, ship_to_city, ship_to_country_code, status
			from purchase_orders where workspace_id = ${workspaceId}
		`;
		expect(row).toMatchObject({
			ship_to_name: "Ada Lovelace",
			ship_to_city: "Sylvan Lake",
			ship_to_country_code: "CA",
			status: "draft",
		});
	});

	it("cannot order the same coffee twice when the event is redelivered", async () => {
		const first = await raisePurchaseOrdersForOrder({ workspaceId, orderId });
		expect(first).toHaveLength(1);

		/**
		 * 🔴 THE property this whole design exists for. `order.paid` is delivered
		 * at least once, so this runs again in normal operation — and without the
		 * unique constraint on (order, supplier) the supplier ships a second batch
		 * at the business's expense, silently.
		 */
		const second = await raisePurchaseOrdersForOrder({ workspaceId, orderId });

		/**
		 * ⚠️ It returns the EXISTING order, flagged, rather than nothing.
		 *
		 * Returning nothing used to look like the safe answer and quietly disabled
		 * retries: a supplier call that failed on the first delivery was never
		 * attempted again, because the second delivery handed the caller an empty
		 * list. The duplicate protection is the unique constraint and the dispatch
		 * claim, never the caller being kept in the dark.
		 */
		expect(second).toHaveLength(1);
		expect(second[0]).toMatchObject({
			id: first[0].id,
			alreadyExisted: true,
			status: "draft",
		});

		const sql = testDbClient();
		const rows = await sql`
			select id from purchase_orders where workspace_id = ${workspaceId}
		`;
		expect(rows).toHaveLength(1);

		// And no second set of lines was written for it.
		const lines = await sql`
			select id from purchase_order_lines where purchase_order_id = ${first[0].id}
		`;
		expect(lines).toHaveLength(1);
	});

	it("lets exactly one worker claim a purchase order for dispatch", async () => {
		const [raised] = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId,
		});

		/**
		 * 🔴 The single-call guarantee. Two workers draining the same at-least-once
		 * event both reach this; a conditional UPDATE means Postgres picks one. A
		 * read-then-write would let both through and the supplier would ship twice.
		 */
		const [a, b] = await Promise.all([
			claimPurchaseOrderForDispatch({
				workspaceId,
				purchaseOrderId: raised.id,
			}),
			claimPurchaseOrderForDispatch({
				workspaceId,
				purchaseOrderId: raised.id,
			}),
		]);
		expect([a, b].filter(Boolean)).toHaveLength(1);

		const winner = a ?? b;
		expect(winner?.status).toBe("sending");
		// The claim carries the address, so the caller needs no second read.
		expect(winner?.shipToCity).toBe("Sylvan Lake");
	});

	it("will not re-claim an order already sent, but will re-claim a failed one", async () => {
		const [raised] = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId,
		});
		const sql = testDbClient();

		await sql`update purchase_orders set status = 'sent' where id = ${raised.id}`;
		expect(
			await claimPurchaseOrderForDispatch({
				workspaceId,
				purchaseOrderId: raised.id,
			}),
		).toBeUndefined();

		// `failed` is claimable on purpose: the outbox redelivers, and a supplier
		// outage that has since passed should not strand the order forever.
		await sql`update purchase_orders set status = 'failed' where id = ${raised.id}`;
		expect(
			await claimPurchaseOrderForDispatch({
				workspaceId,
				purchaseOrderId: raised.id,
			}),
		).toBeDefined();
	});

	it("records the supplier's own order id as the join key for tracking", async () => {
		const [raised] = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId,
		});
		await claimPurchaseOrderForDispatch({
			workspaceId,
			purchaseOrderId: raised.id,
		});
		await recordSupplierOrderPlaced({
			workspaceId,
			purchaseOrderId: raised.id,
			externalOrderId: "gid://shopify/Order/12345",
			externalOrderNumber: "#1001",
			metadata: { provider: "shopify" },
		});

		const sql = testDbClient();
		const [row] = await sql`
			select status, supplier_reference, sent_at, metadata
			from purchase_orders where id = ${raised.id}
		`;
		expect(row.status).toBe("sent");
		expect(row.supplier_reference).toBe("gid://shopify/Order/12345");
		expect(row.sent_at).not.toBeNull();
		expect(row.metadata).toMatchObject({
			externalOrderNumber: "#1001",
			provider: "shopify",
		});
	});

	it("raises nothing for an order it cannot find", async () => {
		const raised = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId: "00000000-0000-4000-8000-0000000015ff",
		});
		expect(raised).toEqual([]);
	});
});

/**
 * 🔴 The inbound half of the fulfilment loop, against a REAL database.
 *
 * The route test proves the HTTP behaviour with this function mocked. These
 * prove the function itself, because the status guard is the only thing standing
 * between a redelivered webhook and a purchase order whose tracking silently
 * changes underneath a customer.
 */
describe("recording what a supplier says it shipped", () => {
	/** Raise, claim and place one purchase order, as a real dispatch would. */
	async function sentPurchaseOrder(externalOrderId: string) {
		const [raised] = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId,
		});
		await claimPurchaseOrderForDispatch({
			workspaceId,
			purchaseOrderId: raised.id,
		});
		await recordSupplierOrderPlaced({
			workspaceId,
			purchaseOrderId: raised.id,
			externalOrderId,
		});
		return raised;
	}

	/**
	 * ⚠️ The real path opens a transaction, because the purchase order and the
	 * customer shipment it produces must commit together. Wrapped here rather
	 * than mocked so the `FOR UPDATE` claim is exercised as written.
	 */
	const record = (input: Parameters<typeof markPurchaseOrderShippedInTx>[1]) =>
		db.transaction((tx) => markPurchaseOrderShippedInTx(tx, input));

	it("matches on the supplier's own order id and stores the tracking", async () => {
		const raised = await sentPurchaseOrder("gid://shopify/Order/5001");

		const result = await record({
			workspaceId,
			supplierId,
			externalOrderId: "gid://shopify/Order/5001",
			carrier: "Canada Post",
			trackingNumber: "TRK-5001",
			trackingUrl: "https://track.example/TRK-5001",
		});

		expect(result).toEqual({
			applied: true,
			purchaseOrderId: raised.id,
			orderId,
			// 🔴 The order lines the shipment is built from. Only the roasted coffee
			// is on this purchase order; the mug the business stocks itself is not.
			lines: [{ orderLineItemId: roastedLineId, quantity: 2 }],
		});

		const sql = testDbClient();
		const [row] = await sql`
			select status, carrier, tracking_number, tracking_url
			from purchase_orders where id = ${raised.id}
		`;
		expect(row).toMatchObject({
			status: "shipped",
			carrier: "Canada Post",
			tracking_number: "TRK-5001",
			tracking_url: "https://track.example/TRK-5001",
		});
	});

	/**
	 * 🔴 THE duplicate defence. At-least-once delivery guarantees this happens,
	 * and it must be a no-op rather than a second write.
	 */
	it("changes nothing when the same fulfilment is delivered twice", async () => {
		const raised = await sentPurchaseOrder("gid://shopify/Order/5002");

		await record({
			workspaceId,
			supplierId,
			externalOrderId: "gid://shopify/Order/5002",
			carrier: "Canada Post",
			trackingNumber: "TRK-FIRST",
		});

		// A redelivery carrying DIFFERENT tracking must not overwrite the first.
		const second = await record({
			workspaceId,
			supplierId,
			externalOrderId: "gid://shopify/Order/5002",
			carrier: "Purolator",
			trackingNumber: "TRK-SECOND",
		});

		expect(second).toEqual({ applied: false, reason: "already-shipped" });

		const sql = testDbClient();
		const [row] = await sql`
			select carrier, tracking_number from purchase_orders where id = ${raised.id}
		`;
		expect(row).toMatchObject({
			carrier: "Canada Post",
			tracking_number: "TRK-FIRST",
		});
	});

	/**
	 * ⚠️ Told apart from `already-shipped` on purpose. This one gets logged at
	 * ERROR by the route; the quiet redelivery above does not.
	 */
	it("refuses a shipment for a purchase order that was never sent", async () => {
		const [raised] = await raisePurchaseOrdersForOrder({
			workspaceId,
			orderId,
		});
		// Still `draft`. Nobody ever asked this supplier for anything.
		const sql = testDbClient();
		await sql`
			update purchase_orders set supplier_reference = 'gid://shopify/Order/5003'
			where id = ${raised.id}
		`;

		expect(
			await record({
				workspaceId,
				supplierId,
				externalOrderId: "gid://shopify/Order/5003",
				trackingNumber: "TRK-5003",
			}),
		).toEqual({ applied: false, reason: "not-sent" });

		const [row] = await sql`
			select status, tracking_number from purchase_orders where id = ${raised.id}
		`;
		expect(row).toMatchObject({ status: "draft", tracking_number: null });
	});

	it("reports a reference it has never issued without failing", async () => {
		await sentPurchaseOrder("gid://shopify/Order/5004");

		// A supplier's own store carries orders QuickDash never raised. Normal.
		expect(
			await record({
				workspaceId,
				supplierId,
				externalOrderId: "gid://shopify/Order/9999",
			}),
		).toEqual({ applied: false, reason: "unknown" });
	});

	/**
	 * 🔴 Tenancy. The reference is a SUPPLIER's id and is only unique within that
	 * supplier's own system, so matching on it alone would let one workspace's
	 * webhook write tracking onto another's purchase order.
	 */
	it("will not apply one workspace's shipment to another's purchase order", async () => {
		await sentPurchaseOrder("gid://shopify/Order/5005");

		expect(
			await record({
				workspaceId: "00000000-0000-4000-8000-0000000015aa",
				supplierId,
				externalOrderId: "gid://shopify/Order/5005",
				trackingNumber: "TRK-INTRUDER",
			}),
		).toEqual({ applied: false, reason: "unknown" });

		expect(
			await record({
				workspaceId,
				supplierId: "00000000-0000-4000-8000-0000000015cc",
				externalOrderId: "gid://shopify/Order/5005",
				trackingNumber: "TRK-INTRUDER",
			}),
		).toEqual({ applied: false, reason: "unknown" });
	});
});

/**
 * What the operator screen reads. 🔴 The shape is the contract: the Purchase
 * orders page shows the customer ORDER NUMBER and the contents, and a uuid or an
 * empty row answers neither of the two questions anybody opens it to ask —
 * "which order is this for" and "what did we ask them to send".
 */
describe("reading purchase orders back", () => {
	it("carries the customer order number, not just its id", async () => {
		await raisePurchaseOrdersForOrder({ workspaceId, orderId });

		const [row] = await listPurchaseOrders(workspaceId);
		expect(row).toMatchObject({
			number: "PO-0001",
			supplierName: "EZPZ Coffee",
			orderId,
			orderNumber: "ORD-9001",
			status: "draft",
		});
	});

	it("carries what the supplier was asked to send", async () => {
		await raisePurchaseOrdersForOrder({ workspaceId, orderId });

		const [row] = await listPurchaseOrders(workspaceId);
		// The mug the business stocks itself is deliberately absent.
		expect(row.lines).toEqual([
			{
				purchaseOrderId: row.id,
				supplierSku: "EZPZ-ETH-250",
				description: "Ethiopia Guji",
				quantity: 2,
				unitCostCents: 1500,
				currency: "CAD",
			},
		]);
	});

	it("comes back empty rather than failing when nothing has been ordered", async () => {
		expect(await listPurchaseOrders(workspaceId)).toEqual([]);
	});
});
