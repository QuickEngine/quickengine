"use server";

import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
import {
	createOrder,
	deleteOrder,
	ensureOrderFulfillment,
	setOrderStatus,
	updateDraftOrder,
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
	return { ok: true, settings: module.settings } as const;
}

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
	// Tracks a key this call actually claimed, so a failure can give it back. The update
	// branch never claims, so it stays null and releases nothing.
	let claimed: { key: string; scope: string } | null = null;
	try {
		const input = await orderInput(workspaceId, formData);
		const orderId = String(formData.get("orderId") ?? "");
		if (orderId) {
			// Updates are naturally idempotent (same orderId + input → same result).
			await updateDraftOrder(workspaceId, orderId, input);
		} else {
			// Guard create against double-fire: only the first request with this key creates.
			const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
			const idempotencyScope = `orders.create:${workspaceId}`;
			if (await claimIdempotencyKey(idempotencyKey, idempotencyScope)) {
				claimed = { key: idempotencyKey, scope: idempotencyScope };
				const prefix =
					typeof authorization.settings.numberPrefix === "string"
						? authorization.settings.numberPrefix
						: "ORD";
				await createOrder(workspaceId, { ...input, numberPrefix: prefix });
			}
		}
	} catch (error) {
		// The claim meant "we're doing the work" — the work failed, so give the key back
		// or the user's corrected retry would be swallowed as a duplicate.
		if (claimed) await releaseIdempotencyKey(claimed.key, claimed.scope);
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
	try {
		await setOrderStatus(workspaceId, orderId, target);
		if (target === "confirmed")
			await ensureOrderFulfillment(workspaceId, orderId);
		if (target === "placed" && authorization.settings.autoConfirm === true) {
			await setOrderStatus(workspaceId, orderId, "confirmed");
			await ensureOrderFulfillment(workspaceId, orderId);
		}
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "ORDER_FULFILLMENT_NOT_COMPLETE")
				return failure("Complete this order's Fulfillment record first.");
			if (error.message === "ORDER_FULFILLMENT_ALREADY_COMPLETE")
				return failure("A completed delivery cannot be cancelled as an order.");
		}
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
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await deleteOrder(workspaceId, String(formData.get("orderId") ?? ""));
	} catch {
		return failure("Only draft orders can be permanently deleted.");
	}
	revalidatePath(`/${workspaceId}/orders`);
	return success();
}
