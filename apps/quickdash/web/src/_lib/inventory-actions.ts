import type {
	QuickInventoryAdjustmentInput,
	QuickInventoryStatus,
} from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type InventoryActionState = ActionState;

export function createInventoryItemAction(
	_previous: InventoryActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const [catalogItemId, variantId = ""] = String(
		form.get("target") ?? "",
	).split("::");
	return actionResult(
		() =>
			api.inventory.create(
				{
					catalogItemId: catalogItemId ?? "",
					catalogItemVariantId: variantId || null,
					lowStockThreshold: Number(form.get("lowStockThreshold") ?? 0),
				},
				idempotencyKey(form),
			),
		"Check the catalog target and low-stock threshold.",
	);
}

export function updateInventoryItemAction(
	_previous: InventoryActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.inventory.update(
				String(form.get("inventoryItemId") ?? ""),
				{ lowStockThreshold: Number(form.get("lowStockThreshold")) },
				idempotencyKey(form),
			),
		"Enter a valid nonnegative low-stock threshold.",
	);
}

export function adjustInventoryAction(
	_previous: InventoryActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.inventory.adjust(
				String(form.get("inventoryItemId") ?? ""),
				{
					kind: String(
						form.get("kind"),
					) as QuickInventoryAdjustmentInput["kind"],
					quantity: Number(form.get("quantity")),
					note: String(form.get("note") ?? "") || null,
				},
				idempotencyKey(form),
			),
		"Check the movement type and positive whole-unit quantity.",
	);
}

export function changeInventoryStatusAction(
	_previous: InventoryActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.inventory.setStatus(
				String(form.get("inventoryItemId") ?? ""),
				String(form.get("target")) as QuickInventoryStatus,
				idempotencyKey(form),
			),
		"That inventory status can no longer be changed.",
	);
}

export function deleteInventoryItemAction(
	_previous: InventoryActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.inventory.delete(
				String(form.get("inventoryItemId") ?? ""),
				idempotencyKey(form),
			),
		"Only archived, unused inventory records can be deleted.",
	);
}
