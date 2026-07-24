"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	applyInventoryAdjustmentCommand,
	createInventoryItemCommand,
	deleteInventoryItemCommand,
	inventorySettingsSchema,
	setInventoryItemStatusCommand,
	updateInventoryItemCommand,
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
		access,
		actorId: session.user.id,
		settings: inventorySettingsSchema.parse(module.settings),
	} as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>,
	operation: string,
	idempotencyKey: string,
	canonicalInput: unknown,
) {
	return {
		abortSignal: new AbortController().signal,
		actor: { id: authorization.actorId, type: "user" as const },
		deadlineAtMs: Date.now() + 10_000,
		fingerprint: await fingerprintCanonicalInput(canonicalInput),
		idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
		operation,
		organizationId: authorization.access.organizationId,
		requestId: crypto.randomUUID(),
		source: "quickdash" as const,
		workspaceId: authorization.access.workspace.id,
	};
}

const outcomeFailure = (kind: "conflict" | "in_progress") =>
	failure(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This stock change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: fallback;

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
		const input = {
			catalogItemId,
			catalogItemVariantId: variantId || null,
			lowStockThreshold: Number(
				formData.get("lowStockThreshold") ??
					authorization.settings.defaultLowStockThreshold,
			),
		};
		const context = await mutationContext(
			authorization,
			"inventory.create",
			key(formData),
			input,
		);
		const outcome = await createInventoryItemCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique"))
			return failure("That catalog target already has an inventory record.");
		return failure(
			message(error, "Check the catalog target and low-stock threshold."),
		);
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function updateInventoryItemAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("inventoryItemId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = {
			lowStockThreshold: Number(formData.get("lowStockThreshold")),
		};
		const context = await mutationContext(
			authorization,
			"inventory.update",
			key(formData),
			{ id, input },
		);
		const outcome = await updateInventoryItemCommand(context, id, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "Enter a valid nonnegative low-stock threshold."),
		);
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function adjustInventoryAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("inventoryItemId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = {
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
		};
		const context = await mutationContext(
			authorization,
			"inventory.adjust",
			key(formData),
			{ id, input },
		);
		const outcome = await applyInventoryAdjustmentCommand(context, id, input, {
			allowNegativeStock: authorization.settings.allowNegativeStock,
		});
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(
				error,
				"Check the movement type and positive whole-unit quantity.",
			),
		);
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function changeInventoryStatusAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("inventoryItemId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const status = String(formData.get("target")) as "active" | "archived";
		const context = await mutationContext(
			authorization,
			"inventory.set-status",
			key(formData),
			{ id, status },
		);
		const outcome = await setInventoryItemStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "That inventory status can no longer be changed."),
		);
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}

export async function deleteInventoryItemAction(
	_previous: InventoryActionState,
	formData: FormData,
): Promise<InventoryActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const id = String(formData.get("inventoryItemId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const context = await mutationContext(
			authorization,
			"inventory.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteInventoryItemCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			message(error, "Only archived, unused inventory records can be deleted."),
		);
	}
	revalidatePath(`/${workspaceId}/inventory`);
	return success();
}
