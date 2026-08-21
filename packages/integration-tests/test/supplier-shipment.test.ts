import { db } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { recordSupplierShipmentInTx } from "@quickengine/mod-shipping";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * A shipment somebody ELSE packed — the dropship case, against a real database.
 *
 * 🔴 What matters here is not that a row appears. It is that the row appears in
 * the shape the CUSTOMER-facing path already understands, so the portal, the
 * operator list and the shipping email work with no code that knows what a
 * supplier is.
 */

const ownerId = "sup-ship-owner";
const workspaceId = "00000000-0000-4000-8000-0000000f0001";
const itemId = "00000000-0000-4000-8000-0000000f0002";
const orderId = "00000000-0000-4000-8000-0000000f0003";
const lineId = "00000000-0000-4000-8000-0000000f0004";
const purchaseOrderId = "00000000-0000-4000-8000-0000000f0005";

const notice = {
	orderId,
	sourceModule: "purchase_orders",
	sourceRecordId: purchaseOrderId,
	lines: [{ orderLineItemId: lineId, quantity: 2 }],
	carrier: "Canada Post",
	trackingNumber: "TRK-EZPZ-1",
	trackingUrl: "https://track.example/TRK-EZPZ-1",
};

const record = (input = notice) =>
	db.transaction((tx) => recordSupplierShipmentInTx(tx, workspaceId, input));

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Supplier Ship Owner', 'supship@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Supplier Ship Workspace', 'ecommerce')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status)
		values (${itemId}, ${workspaceId}, 'Ethiopia Guji', 'physical', 'active')
	`;
	// `confirmed`, because a shipment cannot be created against a `placed` order.
	// Walking it forward is the caller's job, not this function's.
	await sql`
		insert into orders
			(id, workspace_id, client_name, sequence, number, status,
			 subtotal_cents, total_cents, currency,
			 ship_to_name, ship_to_line1, ship_to_city, ship_to_region,
			 ship_to_postal_code, ship_to_country_code)
		values (${orderId}, ${workspaceId}, 'Ada Lovelace', 7001, 'ORD-7001', 'confirmed',
			2400, 2400, 'CAD',
			'Ada Lovelace', '1 Hampton Crescent', 'Sylvan Lake', 'AB', 'T4S 1A1', 'CA')
	`;
	await sql`
		insert into order_line_items
			(id, order_id, catalog_item_id, name, type, quantity,
			 unit_price_cents, line_total_cents, position)
		values (${lineId}, ${orderId}, ${itemId}, 'Ethiopia Guji', 'physical', 2, 1200, 2400, 0)
	`;
});

describe("recording a shipment a supplier packed", () => {
	it("produces a shipped shipment the customer path can already read", async () => {
		const shipment = await record();
		if (!shipment) throw new Error("expected a shipment");

		expect(shipment).toMatchObject({
			orderId,
			status: "shipped",
			carrier: "Canada Post",
			trackingNumber: "TRK-EZPZ-1",
		});

		const sql = testDbClient();
		// 🔴 shippedAt is what the customer's "on its way" message is dated by.
		const [row] = await sql`
			select shipped_at, destination from shipments where id = ${shipment.id}
		`;
		expect(row.shipped_at).not.toBeNull();
		expect(row.destination).toMatchObject({
			recipientName: "Ada Lovelace",
			city: "Sylvan Lake",
			countryCode: "CA",
			// ⚠️ Never a second copy of the buyer's inbox. The notification takes
			// the address from the ORDER.
			email: null,
		});
	});

	/**
	 * 🔴 Zero parcels is deliberate, not an omission. This business never touched
	 * the box, and inventing a weight would poison rate shopping later with a
	 * number nobody measured.
	 */
	it("records what is in the box and nothing about the box", async () => {
		const shipment = await record();
		if (!shipment) throw new Error("expected a shipment");
		const sql = testDbClient();

		const lines = await sql`
			select order_line_item_id, quantity from shipment_lines
			where shipment_id = ${shipment.id}
		`;
		expect(lines).toEqual([{ order_line_item_id: lineId, quantity: 2 }]);

		const parcels = await sql`
			select id from shipment_parcels where shipment_id = ${shipment.id}
		`;
		expect(parcels).toEqual([]);
	});

	/**
	 * 🔴 THE duplicate defence, and it is the DATABASE enforcing it rather than
	 * us remembering to check. `fulfillments_source_unique` has existed unused
	 * for months; this is the first caller ever to populate the columns that arm
	 * it.
	 */
	it("cannot produce a second shipment for the same purchase order", async () => {
		const first = await record();
		expect(first).not.toBeNull();

		// A redelivery carrying different tracking. Still no second shipment.
		const second = await record({
			...notice,
			trackingNumber: "TRK-EZPZ-DUPLICATE",
		});
		expect(second).toBeNull();

		const sql = testDbClient();
		const rows = await sql`
			select tracking_number from shipments where order_id = ${orderId}
		`;
		expect(rows).toEqual([{ tracking_number: "TRK-EZPZ-1" }]);
	});

	/** Reaching `shipped` must carry the delivery record with it. */
	it("moves the delivery record in the same breath", async () => {
		const shipment = await record();
		if (!shipment) throw new Error("expected a shipment");
		const sql = testDbClient();
		const [row] = await sql`
			select f.status, f.source_module, f.source_record_id
			from fulfillments f
			join shipments s on s.fulfillment_id = f.id
			where s.id = ${shipment.id}
		`;
		expect(row).toMatchObject({
			status: "in_progress",
			source_module: "purchase_orders",
			source_record_id: purchaseOrderId,
		});
	});

	/**
	 * 🔴 The redelivery that arrives LATE — after the order has been fulfilled and
	 * is no longer shippable. It must still answer null rather than raise, or the
	 * endpoint returns 500 and the provider redelivers it forever.
	 */
	it("stays quiet on a redelivery that arrives after the order moved on", async () => {
		await record();
		const sql = testDbClient();
		await sql`update orders set status = 'fulfilled' where id = ${orderId}`;

		await expect(record()).resolves.toBeNull();
	});

	it("refuses an order that is not ready to ship", async () => {
		const sql = testDbClient();
		await sql`update orders set status = 'cancelled' where id = ${orderId}`;

		await expect(record()).rejects.toThrow("ORDER_NOT_READY_FOR_SHIPPING");
	});

	/**
	 * ⚠️ A shipment with no lines tells a customer their order is on its way
	 * while claiming nothing is in the box, and silently consumes the one
	 * shipment this purchase order is allowed.
	 */
	it("refuses to ship an empty box", async () => {
		await expect(record({ ...notice, lines: [] })).rejects.toThrow(
			"SHIPMENT_HAS_NO_LINES",
		);
	});

	it("will not ship more than was ordered", async () => {
		await expect(
			record({
				...notice,
				lines: [{ orderLineItemId: lineId, quantity: 3 }],
			}),
		).rejects.toThrow("ORDER_LINE_OVERSHIPPED");
	});
});
