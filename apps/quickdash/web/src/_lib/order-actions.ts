import type { QuickOrderStatus } from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	cents,
	idempotencyKey,
} from "./action-result";

export type OrderActionState = ActionState;

const orderInput = (form: FormData) => {
	const selections = form.getAll("lineSelection").map(String);
	const names = form.getAll("lineName").map(String);
	const types = form.getAll("lineType").map(String);
	const skus = form.getAll("lineSku").map(String);
	const quantities = form.getAll("lineQuantity").map(String);
	const prices = form.getAll("linePrice");
	if (
		![names, types, skus, quantities, prices].every(
			(values) => values.length === selections.length,
		)
	) {
		throw new Error("Check the order lines.");
	}
	return {
		clientId: String(form.get("clientId") ?? ""),
		currency: String(form.get("currency") ?? "USD"),
		notes: String(form.get("notes") ?? "") || null,
		lines: selections.map((selection, index) => {
			const [catalogItemId, variantId = ""] = selection.split("::");
			return {
				catalogItemId:
					!catalogItemId || catalogItemId === "custom" ? null : catalogItemId,
				catalogItemVariantId: variantId || null,
				name: names[index] ?? "",
				type: types[index] ?? "service",
				sku: skus[index] || null,
				quantity: Number(quantities[index]),
				unitPriceCents: cents(prices[index] ?? null) ?? 0,
			};
		}),
	};
};

export function saveOrderAction(_previous: OrderActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("orderId") ?? "");
	const input = orderInput(form);
	return actionResult(async () => {
		let body: typeof input & { numberPrefix?: string } = input;
		if (!id) {
			const context = (
				await api.request<QuickDashContext>("/quickdash/context")
			).data;
			const settings = context.modules.find((module) => module.id === "orders")
				?.settings as { numberPrefix?: string } | undefined;
			body = { ...input, numberPrefix: settings?.numberPrefix ?? "ORD" };
		}
		return api.request(id ? `/orders/${id}` : "/orders", {
			method: id ? "PATCH" : "POST",
			body,
			idempotencyKey: idempotencyKey(form),
		});
	}, "We couldn't save this order.");
}

export function changeOrderStatusAction(
	_previous: OrderActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("orderId") ?? "");
	const target = String(form.get("target")) as QuickOrderStatus;
	const key = idempotencyKey(form);
	return actionResult(async () => {
		await api.orders.setStatus(id, target, `${key}:${target}`);
		if (target === "confirmed") {
			await api.orders.ensureFulfillment(id, `${key}:fulfillment`);
		}
		if (target === "placed") {
			const context = (
				await api.request<QuickDashContext>("/quickdash/context")
			).data;
			const settings = context.modules.find((module) => module.id === "orders")
				?.settings as { autoConfirm?: boolean } | undefined;
			if (settings?.autoConfirm) {
				await api.orders.setStatus(id, "confirmed", `${key}:auto-confirm`);
				await api.orders.ensureFulfillment(id, `${key}:auto-fulfillment`);
			}
		}
	}, "That order can no longer make this lifecycle change.");
}

export function deleteOrderAction(_previous: OrderActionState, form: FormData) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.orders.delete(
				String(form.get("orderId") ?? ""),
				idempotencyKey(form),
			),
		"Only draft orders can be permanently deleted.",
	);
}
