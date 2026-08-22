import { describe, expect, it, vi } from "vitest";
import { refundRestockHandler } from "../src/refund-restock";

/**
 * 🔴 The stock arithmetic is proven in `integration-tests/refund-restock`.
 *
 * These tests cover the other half, which is where this class of bug actually
 * lives: WHETHER the arithmetic is reached. A restock that runs on a partial
 * refund invents stock; one that runs when the operator said the goods were
 * damaged puts a broken bag back on the shelf. Both are silent.
 */

const restock = vi.fn(async () => undefined);
let paymentRow: Array<{ orderId: string | null; status: string }> = [
	{ orderId: "order_1", status: "refunded" },
];

vi.mock("@quickengine/mod-orders", () => ({
	restockOrderStockInTx: (
		_tx: unknown,
		_workspaceId: string,
		_orderId: string,
	) => restock(),
}));

vi.mock("@quickengine/db", () => ({
	payments: { id: "id", orderId: "order_id", status: "status" },
	eq: () => undefined,
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => paymentRow }) }),
		}),
		transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}),
	},
}));

const event = (over: Record<string, unknown> = {}) =>
	({
		id: "evt_1",
		workspaceId: "ws_1",
		aggregateType: "payment",
		aggregateId: "pay_1",
		eventName: "payment.refunded",
		payload: {},
		...over,
	}) as never;

describe("putting stock back when a refund goes out", () => {
	it("restocks a fully refunded order", async () => {
		restock.mockClear();
		paymentRow = [{ orderId: "order_1", status: "refunded" }];
		await refundRestockHandler().handle(event());
		expect(restock).toHaveBeenCalledTimes(1);
	});

	/**
	 * 🔴 A refund is an amount, not a list of items. "$5.00 back on a $50 order"
	 * names nothing that could go on a shelf, so guessing would invent stock.
	 */
	it("restocks nothing on a partial refund", async () => {
		restock.mockClear();
		paymentRow = [{ orderId: "order_1", status: "succeeded" }];
		await refundRestockHandler().handle(event());
		expect(restock).not.toHaveBeenCalled();
	});

	/** The operator said the goods are not coming back. Believe them. */
	it("restocks nothing when the operator declined it", async () => {
		restock.mockClear();
		paymentRow = [{ orderId: "order_1", status: "refunded" }];
		await refundRestockHandler().handle(event({ payload: { restock: false } }));
		expect(restock).not.toHaveBeenCalled();
	});

	it("restocks a refund whose event predates the flag", async () => {
		// An event already in the outbox when this shipped carries no `restock`.
		// Absent must mean yes, matching the schema default.
		restock.mockClear();
		paymentRow = [{ orderId: "order_1", status: "refunded" }];
		await refundRestockHandler().handle(event({ payload: {} }));
		expect(restock).toHaveBeenCalledTimes(1);
	});

	it("ignores a refund against an invoice with no order", async () => {
		restock.mockClear();
		paymentRow = [{ orderId: null, status: "refunded" }];
		await refundRestockHandler().handle(event());
		expect(restock).not.toHaveBeenCalled();
	});

	it("ignores every other event", async () => {
		restock.mockClear();
		await refundRestockHandler().handle(event({ eventName: "order.paid" }));
		expect(restock).not.toHaveBeenCalled();
	});
});
