import { describe, expect, it, vi } from "vitest";
import { referralSettlementHandler } from "../src/referral-settlement";

/**
 * 🔴 The commission was never paid, and nothing said so.
 *
 * `completeReferralsForOrder` and `cancelReferralsForOrder` existed, were
 * tested, and had no production caller at all — so a referral sat `pending` for
 * ever and a partner told they earn 15% earned nothing on every order they sent.
 * These tests exist to make sure the wiring, not just the arithmetic, survives.
 */

const complete = vi.fn(async (_input: unknown) => 1);
const cancel = vi.fn(async (_input: unknown) => 1);
const paymentRow = vi.fn(async () => [{ orderId: "order-from-payment" }]);

vi.mock("@quickengine/mod-orders", () => ({
	completeReferralsForOrder: (input: unknown) => complete(input),
	cancelReferralsForOrder: (input: unknown) => cancel(input),
}));

vi.mock("@quickengine/db", () => ({
	payments: { id: "id", orderId: "order_id" },
	and: (...parts: unknown[]) => parts,
	eq: () => undefined,
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: () => paymentRow() }) }),
		}),
	},
}));

const event = (over: Record<string, unknown>) =>
	({
		id: "evt_1",
		workspaceId: "ws_1",
		aggregateType: "order",
		aggregateId: "order_1",
		payload: {},
		...over,
	}) as never;

describe("paying the partner who brought the sale", () => {
	it("credits the referral when the order is paid", async () => {
		complete.mockClear();
		await referralSettlementHandler().handle(
			event({ eventName: "order.paid", payload: { orderId: "order_1" } }),
		);
		expect(complete).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			orderId: "order_1",
		});
	});

	/**
	 * 🔴 A refund event is about a PAYMENT. Its payload has no order, and its
	 * aggregate is the payment — so the order has to be looked up, or the
	 * reversal silently matches nothing.
	 */
	it("reverses the credit on a refund, resolving the order from the payment", async () => {
		cancel.mockClear();
		await referralSettlementHandler().handle(
			event({
				eventName: "payment.refunded",
				aggregateType: "payment",
				aggregateId: "pay_1",
				payload: { paymentId: "pay_1", refundId: "ref_1" },
			}),
		);
		expect(cancel).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			orderId: "order-from-payment",
		});
	});

	it("reverses the credit when the order is cancelled", async () => {
		cancel.mockClear();
		await referralSettlementHandler().handle(
			event({
				eventName: "order.status-changed",
				payload: { orderId: "order_1", status: "cancelled" },
			}),
		);
		expect(cancel).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			orderId: "order_1",
		});
	});

	/** Any other status change is ordinary progress and must not reverse anything. */
	it("ignores a status change that is not a cancellation", async () => {
		cancel.mockClear();
		complete.mockClear();
		await referralSettlementHandler().handle(
			event({
				eventName: "order.status-changed",
				payload: { orderId: "order_1", status: "processing" },
			}),
		);
		expect(cancel).not.toHaveBeenCalled();
		expect(complete).not.toHaveBeenCalled();
	});

	it("ignores events it has no business acting on", async () => {
		complete.mockClear();
		cancel.mockClear();
		await referralSettlementHandler().handle(
			event({ eventName: "catalog-item.updated" }),
		);
		expect(complete).not.toHaveBeenCalled();
		expect(cancel).not.toHaveBeenCalled();
	});
});
