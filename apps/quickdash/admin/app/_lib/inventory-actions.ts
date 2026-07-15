"use server";

import { getSession } from "@quickengine/auth/server";
import {
	applyInventoryAdjustment,
	createInventoryItem,
	deleteInventoryItem,
	inventorySettingsSchema,
	setInventoryItemStatus,
	updateInventoryItem,
} from "@quickengine/mod-inventory";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type InventoryActionState = {
	error: string | null;
	completionId: string | null;
};
const failure = (error: string): InventoryActionState => ({
	error,
	completionId: null,
});
const success = (): InventoryActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session)
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access)
		return { ok: false, error: "Workspace access was not found." } as const;
	const module = access.modules.find((item) => item.id === "inventory");
	if (!module)
		return {
			ok: false,
			error: "Inventory is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		settings: inventorySettingsSchema.parse(module.settings),
	} as const;
}

export async function createInventoryItemAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	const [catalogItemId, variantId = ""] = String(
		formData.get("target") ?? "",
	).split("::");
	try {
		await createInventoryItem(workspaceId, {
			catalogItemId,
			catalogItemVariantId: variantId || null,
			lowStockThreshold: Number(
				formData.get("lowStockThreshold") ??
					authorization.settings.defaultLowStockThreshold,
			),
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique"))
			return failure("That catalog target already has an inventory record.");
		return failure("Check the catalog target and low-stock threshold.");
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function updateInventoryItemAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await updateInventoryItem(
			workspaceId,
			String(formData.get("inventoryItemId") ?? ""),
			{ lowStockThreshold: Number(formData.get("lowStockThreshold")) },
		);
	} catch {
		return failure("Enter a valid nonnegative low-stock threshold.");
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function adjustInventoryAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await applyInventoryAdjustment(
			workspaceId,
			String(formData.get("inventoryItemId") ?? ""),
			{
				kind: String(formData.get("kind")) as
					| "receive"
					| "sale"
					| "customer_return"
					| "damage"
					| "correction_in"
					| "correction_out"
					| "reserve"
					| "release"
					| "fulfill_reserved",
				quantity: Number(formData.get("quantity")),
				note: String(formData.get("note") ?? "") || null,
			},
			{ allowNegativeStock: authorization.settings.allowNegativeStock },
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "INVENTORY_INSUFFICIENT_AVAILABLE"
		)
			return failure("That movement would make available stock negative.");
		if (
			error instanceof Error &&
			error.message === "INVENTORY_RESERVED_BELOW_ZERO"
		)
			return failure("That movement exceeds the currently reserved quantity.");
		if (error instanceof Error && error.message === "INVENTORY_ITEM_ARCHIVED")
			return failure("Restore this inventory record before changing stock.");
		return failure("Check the movement type and positive whole-unit quantity.");
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function changeInventoryStatusAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await setInventoryItemStatus(
			workspaceId,
			String(formData.get("inventoryItemId") ?? ""),
			String(formData.get("target")) as "active" | "archived",
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "INVENTORY_HAS_RESERVATIONS"
		)
			return failure("Release or fulfill reserved stock before archiving.");
		return failure("That inventory status can no longer be changed.");
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function deleteInventoryItemAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await deleteInventoryItem(
			workspaceId,
			String(formData.get("inventoryItemId") ?? ""),
		);
	} catch (error) {
		if (error instanceof Error && error.message === "INVENTORY_HISTORY_EXISTS")
			return failure(
				"Inventory with movement history is retained for auditability.",
			);
		if (
			error instanceof Error &&
			error.message === "INVENTORY_BALANCE_NOT_ZERO"
		)
			return failure(
				"Inventory balances must be zero before permanent deletion.",
			);
		return failure("Only archived, unused inventory records can be deleted.");
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}
