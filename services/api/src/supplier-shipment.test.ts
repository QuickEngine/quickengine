import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The orchestration, with the modules mocked.
 *
 * ⚠️ Same shape as `checkout-settlement.test.ts` beside it, and for the same
 * reason: what each module COMMITS is proven against a real database in its own
 * package. What this file proves is the sequence — that the claim happens before
 * anything else, that the order is walked forward the right number of hops, and
 * that a supplier shipping against an order that cannot receive one is recorded
 * rather than lost.
 */
const mocks = vi.hoisted(() => ({
	auditValues: vi.fn(),
	outboxValues: vi.fn(),
	orderStatus: vi.fn(),
	markPurchaseOrderShippedInTx: vi.fn(),
	recordPurchaseOrderShipmentFailureInTx: vi.fn(),
	recordSupplierShipmentInTx: vi.fn(),
	setOrderStatusInTx: vi.fn(),
}));

const auditTable = Symbol("audit");
const outboxTable = Symbol("outbox");
vi.mock("@quickengine/db", () => ({
	and: (...parts: unknown[]) => parts,
	apiAuditEvents: auditTable,
	apiOutboxEvents: outboxTable,
	eq: (...parts: unknown[]) => parts,
	orders: { workspaceId: "workspace_id", id: "id", status: "status" },
	db: {
		transaction: async (work: (tx: unknown) => Promise<unknown>) =>
			work({
				insert: (table: symbol) => ({
					values: table === auditTable ? mocks.auditValues : mocks.outboxValues,
				}),
				select: () => ({
					from: () => ({
						where: () => ({ limit: () => mocks.orderStatus() }),
					}),
				}),
			}),
	},
}));

vi.mock("@quickengine/mod-inventory", () => ({
	markPurchaseOrderShippedInTx: mocks.markPurchaseOrderShippedInTx,
	recordPurchaseOrderShipmentFailureInTx:
		mocks.recordPurchaseOrderShipmentFailureInTx,
}));
vi.mock("@quickengine/mod-orders", () => ({
	setOrderStatusInTx: mocks.setOrderStatusInTx,
}));
vi.mock("@quickengine/mod-shipping", () => ({
	recordSupplierShipmentInTx: mocks.recordSupplierShipmentInTx,
}));

const { recordSupplierShipmentNotice } = await import("./supplier-shipment");

const PO = "00000000-0000-4000-8000-00000000b001";
const ORDER = "00000000-0000-4000-8000-00000000b002";

const input = {
	workspaceId: "00000000-0000-4000-8000-00000000b003",
	supplierId: "00000000-0000-4000-8000-00000000b004",
	provider: "shopify",
	eventId: "evt_ship_1",
	externalOrderId: "gid://shopify/Order/1",
	carrier: "Canada Post",
	trackingNumber: "TRK1",
	trackingUrl: null,
};

const claimed = {
	applied: true as const,
	purchaseOrderId: PO,
	orderId: ORDER,
	lines: [{ orderLineItemId: "line_1", quantity: 2 }],
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.recordSupplierShipmentInTx.mockResolvedValue({ id: "shp_1" });
	mocks.orderStatus.mockResolvedValue([{ status: "placed" }]);
});

describe("recording a supplier's shipment notice", () => {
	/**
	 * 🔴 Nothing else may run first. The claim is the duplicate defence, and
	 * walking the order or building a shipment before winning it would happen on
	 * every redelivery.
	 */
	it("does nothing at all when the claim is refused", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce({
			applied: false,
			reason: "already-shipped",
		});

		expect(await recordSupplierShipmentNotice(input)).toEqual({
			applied: false,
			reason: "already-shipped",
		});
		expect(mocks.setOrderStatusInTx).not.toHaveBeenCalled();
		expect(mocks.recordSupplierShipmentInTx).not.toHaveBeenCalled();
		expect(mocks.outboxValues).not.toHaveBeenCalled();
	});

	/**
	 * Settlement leaves a paid order at `placed`; a shipment demands `confirmed`
	 * or `processing`. Two hops, through the ordinary Orders transition.
	 */
	it("walks a paid order forward two hops before shipping it", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce(claimed);

		const result = await recordSupplierShipmentNotice(input);

		expect(mocks.setOrderStatusInTx.mock.calls.map((call) => call[3])).toEqual([
			"confirmed",
			"processing",
		]);
		expect(result).toEqual({
			applied: true,
			purchaseOrderId: PO,
			orderId: ORDER,
			shipmentId: "shp_1",
		});
	});

	it("walks a confirmed order one hop, and a processing order none", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValue(claimed);

		mocks.orderStatus.mockResolvedValueOnce([{ status: "confirmed" }]);
		await recordSupplierShipmentNotice(input);
		expect(mocks.setOrderStatusInTx.mock.calls.map((call) => call[3])).toEqual([
			"processing",
		]);

		mocks.setOrderStatusInTx.mockClear();
		mocks.orderStatus.mockResolvedValueOnce([{ status: "processing" }]);
		await recordSupplierShipmentNotice(input);
		expect(mocks.setOrderStatusInTx).not.toHaveBeenCalled();
	});

	/**
	 * 🔴 The event a CUSTOMER eventually receives. `shipment.status-changed` with
	 * status `shipped` is what `customer-notifications.ts` already listens for.
	 * If this stops being emitted, the buyer silently stops being told their
	 * order shipped, and every test above would still pass.
	 */
	it("emits the event the customer notification path listens for", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce(claimed);

		await recordSupplierShipmentNotice(input);

		const events = mocks.outboxValues.mock.calls[0][0];
		expect(events).toEqual([
			expect.objectContaining({ eventName: "shipment.created" }),
			expect.objectContaining({
				eventName: "shipment.status-changed",
				payload: { shipmentId: "shp_1", status: "shipped" },
			}),
		]);
		// Evidence points at the supplier, not at a person.
		expect(events[0]).toMatchObject({
			actorType: "supplier",
			actorId: "shopify",
			requestId: "evt_ship_1",
		});
	});

	/**
	 * 🔴 Cancelled or already fulfilled. The supplier really did ship, so the
	 * purchase order KEEPS its tracking — but a person has to sort it out, so the
	 * reason is written where they will find it rather than thrown away.
	 */
	it("records why, when the order cannot receive a shipment", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce(claimed);
		mocks.orderStatus.mockResolvedValueOnce([{ status: "cancelled" }]);

		expect(await recordSupplierShipmentNotice(input)).toEqual({
			applied: false,
			reason: "order-not-shippable",
		});
		expect(mocks.recordPurchaseOrderShipmentFailureInTx).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ purchaseOrderId: PO }),
		);
		expect(mocks.recordSupplierShipmentInTx).not.toHaveBeenCalled();
		expect(mocks.outboxValues).not.toHaveBeenCalled();
	});

	/** A purchase order whose order lines are gone. Tracking stands; nothing ships. */
	it("keeps the tracking when there is nothing to ship it against", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce({
			...claimed,
			lines: [],
		});

		expect(await recordSupplierShipmentNotice(input)).toEqual({
			applied: true,
			purchaseOrderId: PO,
			orderId: ORDER,
			shipmentId: null,
		});
		expect(mocks.recordPurchaseOrderShipmentFailureInTx).toHaveBeenCalled();
		expect(mocks.recordSupplierShipmentInTx).not.toHaveBeenCalled();
	});

	/**
	 * ⚠️ Null from shipping means `fulfillments_source_unique` already had this
	 * purchase order. No second shipment, and no second customer email.
	 */
	it("emits nothing when the shipment already existed", async () => {
		mocks.markPurchaseOrderShippedInTx.mockResolvedValueOnce(claimed);
		mocks.recordSupplierShipmentInTx.mockResolvedValueOnce(null);

		expect(await recordSupplierShipmentNotice(input)).toMatchObject({
			applied: true,
			shipmentId: null,
		});
		expect(mocks.outboxValues).not.toHaveBeenCalled();
	});
});
