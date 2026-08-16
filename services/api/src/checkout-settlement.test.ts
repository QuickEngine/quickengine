import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auditValues: vi.fn(),
	outboxValues: vi.fn(),
	setOrderStatusInTx: vi.fn(),
	setPaymentStatusInTx: vi.fn(),
}));

const auditTable = Symbol("audit");
const outboxTable = Symbol("outbox");
vi.mock("@quickengine/db", () => ({
	apiAuditEvents: auditTable,
	apiOutboxEvents: outboxTable,
	db: {
		transaction: async (work: (tx: unknown) => Promise<unknown>) =>
			work({
				insert: (table: symbol) => ({
					values: table === auditTable ? mocks.auditValues : mocks.outboxValues,
				}),
			}),
	},
}));

vi.mock("@quickengine/mod-orders", () => ({
	setOrderStatusInTx: mocks.setOrderStatusInTx,
}));

vi.mock("@quickengine/mod-payments", () => ({
	setPaymentStatusInTx: mocks.setPaymentStatusInTx,
}));

const { settlePaidCheckout } = await import("./checkout-settlement");

const input = {
	eventId: "evt_paid_once",
	orderId: "00000000-0000-4000-8000-00000000a001",
	paymentId: "00000000-0000-4000-8000-00000000a002",
	provider: "stripe" as const,
	workspaceId: "00000000-0000-4000-8000-00000000a003",
};

describe("provider-confirmed checkout settlement", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.setOrderStatusInTx.mockResolvedValue({
			id: input.orderId,
			status: "placed",
		});
		mocks.setPaymentStatusInTx.mockResolvedValue({
			id: input.paymentId,
			status: "succeeded",
		});
	});

	it("commits payment, the inventory-owning order transition and durable evidence together", async () => {
		const result = await settlePaidCheckout(input);

		expect(mocks.setPaymentStatusInTx).toHaveBeenCalledWith(
			expect.anything(),
			input.workspaceId,
			input.paymentId,
			"succeeded",
		);
		expect(mocks.setOrderStatusInTx).toHaveBeenCalledWith(
			expect.anything(),
			input.workspaceId,
			input.orderId,
			"placed",
		);
		expect(mocks.auditValues).toHaveBeenCalledOnce();
		expect(mocks.outboxValues).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					eventName: "order.paid",
					requestId: input.eventId,
				}),
			]),
		);
		expect(result).toEqual({
			applied: true,
			orderId: input.orderId,
			workspaceId: input.workspaceId,
			status: "placed",
		});
	});

	it("writes no outward evidence when the order transition fails", async () => {
		mocks.setOrderStatusInTx.mockRejectedValue(
			new Error("INVENTORY_INSUFFICIENT"),
		);

		await expect(settlePaidCheckout(input)).rejects.toThrow(
			"INVENTORY_INSUFFICIENT",
		);
		expect(mocks.auditValues).not.toHaveBeenCalled();
		expect(mocks.outboxValues).not.toHaveBeenCalled();
	});

	it("settles a stranded payment without replaying paid-order events", async () => {
		mocks.setPaymentStatusInTx.mockRejectedValue(
			new Error("PAYMENT_STATUS_UNCHANGED"),
		);
		mocks.setOrderStatusInTx.mockRejectedValue(
			new Error("ORDER_STATUS_UNCHANGED"),
		);

		await expect(settlePaidCheckout(input)).resolves.toEqual({
			applied: false,
			reason: "order was not awaiting payment",
			// A redelivery finding the order already moved on is the normal shape of
			// at-least-once delivery, so it must NOT raise a dropped-settlement alert.
			expected: true,
		});
		expect(mocks.auditValues).not.toHaveBeenCalled();
		expect(mocks.outboxValues).not.toHaveBeenCalled();
	});
});
