"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	createCatalogItemCommand,
	createProductVariantCommand,
	deleteCatalogItemCommand,
	deleteProductVariantCommand,
	setCatalogItemStatusCommand,
	setProductVariantStatusCommand,
	updateCatalogItemCommand,
	updateProductVariantCommand,
} from "@quickengine/mod-products-services";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type CatalogActionState = {
	error: string | null;
	completionId: string | null;
};
const failure = (error: string): CatalogActionState => ({
	error,
	completionId: null,
});
const success = (): CatalogActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) {
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	}
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		return { ok: false, error: "Workspace access was not found." } as const;
	}
	if (!access.modules.some((module) => module.id === "products-services")) {
		return {
			ok: false,
			error: "Products & Services is not enabled for this workspace.",
		} as const;
	}
	return { ok: true, access, actorId: session.user.id } as const;
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
			: "This catalog change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

function cents(value: FormDataEntryValue | null): number | null {
	const text = String(value ?? "").trim();
	if (!text) return null;
	if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("INVALID_PRICE");
	const [whole, fraction = ""] = text.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function itemInput(formData: FormData) {
	const pricingModel = String(formData.get("pricingModel"));
	return {
		name: String(formData.get("name") ?? ""),
		description: String(formData.get("description") ?? "") || null,
		type: String(formData.get("type")) as
			| "physical"
			| "digital"
			| "service"
			| "package"
			| "rental",
		sku: String(formData.get("sku") ?? "") || null,
		pricingModel: pricingModel as
			| "fixed"
			| "starting_at"
			| "hourly"
			| "custom_quote"
			| "free",
		priceCents: ["custom_quote", "free"].includes(pricingModel)
			? null
			: cents(formData.get("price")),
		currency: String(formData.get("currency") ?? "USD"),
		unitLabel: String(formData.get("unitLabel") ?? "") || null,
	};
}

function variantInput(formData: FormData) {
	const options = String(formData.get("options") ?? "")
		.split(",")
		.filter(Boolean)
		.map((part) => {
			const [name, ...value] = part.split(":");
			return { name: name?.trim() ?? "", value: value.join(":").trim() };
		});
	return {
		options,
		sku: String(formData.get("sku") ?? "") || null,
		priceCentsOverride: cents(formData.get("priceOverride")),
	};
}

function message(error: unknown) {
	if (error instanceof Error && error.name === "DomainError")
		return error.message;
	if (error instanceof Error && error.message === "INVALID_PRICE")
		return "Enter a valid price with no more than two decimals.";
	if (error instanceof Error && error.name === "ZodError")
		return "Check the required fields and pricing details.";
	return "We couldn't save this catalog record.";
}

export async function saveCatalogItemAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("itemId") ?? "");
		const input = itemInput(formData);
		if (id) {
			const context = await mutationContext(
				authorization,
				"catalog-items.update",
				key(formData),
				{ id, input },
			);
			const outcome = await updateCatalogItemCommand(context, id, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		} else {
			const context = await mutationContext(
				authorization,
				"catalog-items.create",
				key(formData),
				input,
			);
			const outcome = await createCatalogItemCommand(context, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		}
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function changeCatalogItemStatusAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("itemId"));
		const status = String(formData.get("target")) as
			| "draft"
			| "active"
			| "archived";
		const context = await mutationContext(
			authorization,
			"catalog-items.set-status",
			key(formData),
			{ id, status },
		);
		const outcome = await setCatalogItemStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function deleteCatalogItemAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("itemId"));
		const context = await mutationContext(
			authorization,
			"catalog-items.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteCatalogItemCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function saveVariantAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("variantId") ?? "");
		const input = variantInput(formData);
		if (id) {
			const context = await mutationContext(
				authorization,
				"product-variants.update",
				key(formData),
				{ id, input },
			);
			const outcome = await updateProductVariantCommand(context, id, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		} else {
			const itemId = String(formData.get("itemId"));
			const context = await mutationContext(
				authorization,
				"product-variants.create",
				key(formData),
				{ input, itemId },
			);
			const outcome = await createProductVariantCommand(context, itemId, input);
			if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
		}
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function changeVariantStatusAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("variantId"));
		const status = String(formData.get("target")) as
			| "draft"
			| "active"
			| "archived";
		const context = await mutationContext(
			authorization,
			"product-variants.set-status",
			key(formData),
			{ id, status },
		);
		const outcome = await setProductVariantStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function deleteVariantAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const id = String(formData.get("variantId"));
		const context = await mutationContext(
			authorization,
			"product-variants.delete",
			key(formData),
			{ id },
		);
		const outcome = await deleteProductVariantCommand(context, id);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(message(error));
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}
