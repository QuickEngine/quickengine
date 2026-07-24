"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	createOrderCommand,
	deleteOrderCommand,
	ensureOrderFulfillmentCommand,
	ordersSettingsSchema,
	setOrderStatusCommand,
	updateDraftOrderCommand,
} from "@quickengine/mod-orders";
import {
	formatVariantLabel,
	getCatalogItem,
	getProductVariant,
} from "@quickengine/mod-products-services";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type OrderActionState = {
	error: string | null;
	completionId: string | null;
};
const failure = (error: string): OrderActionState => ({
	error,
	completionId: null,
});
const success = (): OrderActionState => ({
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
	const module = access.modules.find((item) => item.id === "orders");
	if (!module)
		return {
			ok: false,
			error: "Orders is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		access,
		actorId: session.user.id,
		settings: ordersSettingsSchema.parse(module.settings),
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
			: "This order change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

function cents(value: FormDataEntryValue | null) {
	const text = String(value ?? "").trim();
	if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("INVALID_PRICE");
	const [whole, fraction = ""] = text.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

async function orderInput(workspaceId: string, formData: FormData) {
	const selections = formData.getAll("lineSelection").map(String);
	const names = formData.getAll("lineName").map(String);
	const types = formData.getAll("lineType").map(String);
	const skus = formData.getAll("lineSku").map(String);
	const quantities = formData.getAll("lineQuantity").map(String);
	const prices = formData.getAll("linePrice");
	if (
		![names, types, skus, quantities, prices].every(
			(values) => values.length === selections.length,
		)
	) {
		throw new Error("INVALID_LINES");
	}
	const lines = await Promise.all(
		selections.map(async (selection, index) => {
			const [catalogItemId, catalogItemVariantId = ""] = selection.split("::");
			if (!catalogItemId || catalogItemId === "custom") {
				return {
					catalogItemId: null,
					catalogItemVariantId: null,
					name: names[index],
					type: types[index] as
						| "physical"
						| "digital"
						| "service"
						| "package"
						| "rental",
					sku: skus[index] || null,
					quantity: Number(quantities[index]),
					unitPriceCents: cents(prices[index] ?? null),
				};
			}
			const item = await getCatalogItem(workspaceId, catalogItemId);
			if (item?.status !== "active")
				throw new Error("CATALOG_ITEM_UNAVAILABLE");
			let variant: Awaited<ReturnType<typeof getProductVariant>> | undefined;
			if (catalogItemVariantId) {
				variant = await getProductVariant(workspaceId, catalogItemVariantId);
				if (variant?.status !== "active" || variant.catalogItemId !== item.id)
					throw new Error("CATALOG_VARIANT_UNAVAILABLE");
			}
			return {
				catalogItemId: item.id,
				catalogItemVariantId: variant?.id ?? null,
				name: variant
					? `${item.name} — ${formatVariantLabel(variant.options)}`
					: item.name,
				type: item.type,
				sku: variant?.sku ?? item.sku,
				quantity: Number(quantities[index]),
				unitPriceCents: cents(prices[index] ?? null),
			};
		}),
	);
	return {
		clientId: String(formData.get("clientId") ?? ""),
		currency: String(formData.get("currency") ?? "USD"),
		notes: String(formData.get("notes") ?? "") || null,
		lines,
	};
}

function message(error: unknown) {
	// Durable commands raise DomainError with copy already written for a person.
	if (error instanceof Error && error.name === "DomainError")
		return error.message;
	if (!(error instanceof Error)) return "We couldn't save this order.";
	if (error.message === "INVALID_PRICE")
		return "Enter valid line prices with no more than two decimals.";
	if (error.message === "INVALID_LINES") return "Check the order lines.";
	if (error.message.includes("UNAVAILABLE"))
		return "A selected catalog item or variant is no longer active.";
	if (error.message.includes("CLIENT"))
		return "The selected client is no longer available in this workspace.";
	if (error.name === "ZodError")
		return "Check the client, currency, quantities, prices, and line details.";
	return "We couldn't save this order.";
}

export async function saveOrderAction(
	_previous: OrderActionState,
	formData: FormData,
): Promise<OrderActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = await orderInput(workspaceId, formData);
		const orderId = String(formData.get("orderId") ?? "");
		if (orderId) {
			const context = await mutationContext(
				authorization,
				"orders.update",
				key(formData),
				{ id: orderId, input },
			);
			const outcome = await updateDraftOrderCommand(context, orderId, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		} else {
			const created = {
				...input,
				numberPrefix: authorization.settings.numberPrefix,
			};
			const context = await mutationContext(
				authorization,
				"orders.create",
				key(formData),
				created,
			);
			const outcome = await createOrderCommand(context, created);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		}
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/orders`);
	return success();
}

export async function changeOrderStatusAction(
	_previous: OrderActionState,
	formData: FormData,
): Promise<OrderActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const orderId = String(formData.get("orderId") ?? "");
	const target = String(formData.get("target") ?? "") as
		| "placed"
		| "confirmed"
		| "processing"
		| "fulfilled"
		| "cancelled";
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	// One button press can drive several durable commands (status, auto-confirm, opening
	// fulfillment). Each needs its own stable key derived from the form's key so a retry
	// replays every step instead of colliding on one.
	const step = async (
		operation: string,
		suffix: string,
		canonicalInput: unknown,
		run: (
			context: Awaited<ReturnType<typeof mutationContext>>,
		) => Promise<{ kind: string }>,
	) => {
		const context = await mutationContext(
			authorization,
			operation,
			`${key(formData)}:${suffix}`,
			canonicalInput,
		);
		return run(context);
	};
	try {
		const moved = await step(
			"orders.set-status",
			target,
			{ id: orderId, status: target },
			(context) => setOrderStatusCommand(context, orderId, target),
		);
		if (moved.kind !== "success")
			return outcomeFailure(moved.kind as "conflict" | "in_progress");

		if (target === "confirmed") {
			await step(
				"orders.ensure-fulfillment",
				"fulfillment",
				{ id: orderId },
				(context) => ensureOrderFulfillmentCommand(context, orderId),
			);
		}
		if (target === "placed" && authorization.settings.autoConfirm) {
			await step(
				"orders.set-status",
				"auto-confirm",
				{ id: orderId, status: "confirmed" },
				(context) => setOrderStatusCommand(context, orderId, "confirmed"),
			);
			await step(
				"orders.ensure-fulfillment",
				"auto-fulfillment",
				{ id: orderId },
				(context) => ensureOrderFulfillmentCommand(context, orderId),
			);
		}
	} catch (error) {
		if (error instanceof Error && error.name === "DomainError")
			return failure(error.message);
		return failure("That order can no longer make this lifecycle change.");
	}
	revalidatePath(`/${workspaceId}/orders`);
	revalidatePath(`/${workspaceId}/fulfillment`);
	return success();
}

export async function deleteOrderAction(
	_previous: OrderActionState,
	formData: FormData,
): Promise<OrderActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const orderId = String(formData.get("orderId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const context = await mutationContext(
			authorization,
			"orders.delete",
			key(formData),
			{ id: orderId },
		);
		const outcome = await deleteOrderCommand(context, orderId);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		if (error instanceof Error && error.name === "DomainError")
			return failure(error.message);
		return failure("Only draft orders can be permanently deleted.");
	}
	revalidatePath(`/${workspaceId}/orders`);
	return success();
}
