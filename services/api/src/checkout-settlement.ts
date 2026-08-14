import { apiAuditEvents, apiOutboxEvents, db } from "@quickengine/db";
import { setOrderStatusInTx } from "@quickengine/mod-orders";
import {
	type PaidCheckoutCoordinator,
	setPaymentStatusInTx,
} from "@quickengine/mod-payments";

const alreadySettled = (error: unknown) => {
	const reason = error instanceof Error ? error.message : "";
	return (
		reason === "PAYMENT_STATUS_UNCHANGED" ||
		reason === "PAYMENT_ILLEGAL_TRANSITION"
	);
};

/**
 * The provider-confirmed commerce commit.
 *
 * Payment, order placement, inventory reservation, audit evidence and outbound
 * events either all commit or all roll back. A browser success response never
 * enters this path; only a verified provider event does.
 */
export const settlePaidCheckout: PaidCheckoutCoordinator = async (input) =>
	db.transaction(async (tx) => {
		try {
			await setPaymentStatusInTx(
				tx,
				input.workspaceId,
				input.paymentId,
				"succeeded",
			);
		} catch (error) {
			if (!alreadySettled(error)) throw error;
		}

		let order: Awaited<ReturnType<typeof setOrderStatusInTx>>;
		try {
			// This is the ordinary Orders transition, not a direct UPDATE. It owns
			// stock reservation and enforces the same lifecycle as operator actions.
			order = await setOrderStatusInTx(
				tx,
				input.workspaceId,
				input.orderId,
				"placed",
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : "";
			if (
				reason === "ORDER_STATUS_UNCHANGED" ||
				reason === "ORDER_ILLEGAL_TRANSITION"
			) {
				return { applied: false, reason: "order was not awaiting payment" };
			}
			throw error;
		}

		const evidence = {
			workspaceId: input.workspaceId,
			actorType: "payment_provider",
			actorId: input.provider,
			requestId: input.eventId,
			source: "system",
		} as const;

		await tx.insert(apiAuditEvents).values([
			{
				...evidence,
				action: "payment.status-changed",
				resourceType: "payment",
				resourceId: input.paymentId,
				metadata: { status: "succeeded", provider: input.provider },
			},
			{
				...evidence,
				action: "order.paid",
				resourceType: "order",
				resourceId: input.orderId,
				metadata: { status: "placed", provider: input.provider },
			},
		]);

		await tx.insert(apiOutboxEvents).values([
			{
				...evidence,
				aggregateType: "payment",
				aggregateId: input.paymentId,
				eventName: "payment.status-changed",
				payload: { paymentId: input.paymentId, status: "succeeded" },
				version: 1,
			},
			{
				...evidence,
				aggregateType: "order",
				aggregateId: input.orderId,
				eventName: "order.status-changed",
				payload: { orderId: input.orderId, status: "placed" },
				version: 1,
			},
			{
				...evidence,
				aggregateType: "order",
				aggregateId: input.orderId,
				eventName: "order.paid",
				payload: {
					orderId: input.orderId,
					paymentId: input.paymentId,
					provider: input.provider,
				},
				version: 1,
			},
		]);

		return {
			applied: true,
			orderId: order.id,
			workspaceId: input.workspaceId,
			status: order.status,
		};
	});
