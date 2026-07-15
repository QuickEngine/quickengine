"use server";

import { getSession } from "@quickengine/auth/server";
import {
	createCatalogItem,
	createProductVariant,
	deleteCatalogItem,
	deleteProductVariant,
	setCatalogItemStatus,
	setProductVariantStatus,
	updateCatalogItem,
	updateProductVariant,
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
	if (!session) return failure("Your session expired. Please sign in again.");
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) return failure("Workspace access was not found.");
	if (!access.modules.some((module) => module.id === "products-services"))
		return failure("Products & Services is not enabled for this workspace.");
	return null;
}

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

function message(error: unknown) {
	if (!(error instanceof Error)) return "We couldn't save this catalog record.";
	if (error.message.includes("SKU"))
		return "That SKU is already used in this workspace.";
	if (error.message.includes("combination_unique"))
		return "That exact variant already exists.";
	if (error.message === "INVALID_PRICE")
		return "Enter a valid price with no more than two decimals.";
	if (error.name === "ZodError")
		return "Check the required fields and pricing details.";
	return "We couldn't save this catalog record.";
}

export async function saveCatalogItemAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		const id = String(formData.get("itemId") ?? "");
		if (id) await updateCatalogItem(workspaceId, id, itemInput(formData));
		else await createCatalogItem(workspaceId, itemInput(formData));
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
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		await setCatalogItemStatus(
			workspaceId,
			String(formData.get("itemId")),
			String(formData.get("target")) as "draft" | "active" | "archived",
		);
	} catch {
		return failure(
			"That catalog item can no longer make this lifecycle change.",
		);
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function deleteCatalogItemAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		await deleteCatalogItem(workspaceId, String(formData.get("itemId")));
	} catch {
		return failure("Only archived, unreferenced catalog items can be deleted.");
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
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

export async function saveVariantAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		const id = String(formData.get("variantId") ?? "");
		if (id) await updateProductVariant(workspaceId, id, variantInput(formData));
		else
			await createProductVariant(
				workspaceId,
				String(formData.get("itemId")),
				variantInput(formData),
			);
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
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		await setProductVariantStatus(
			workspaceId,
			String(formData.get("variantId")),
			String(formData.get("target")) as "draft" | "active" | "archived",
		);
	} catch {
		return failure(
			"Activate the parent item first, or choose a valid lifecycle change.",
		);
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}

export async function deleteVariantAction(
	_previous: CatalogActionState,
	formData: FormData,
): Promise<CatalogActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const denied = await authorize(workspaceId);
	if (denied) return denied;
	try {
		await deleteProductVariant(workspaceId, String(formData.get("variantId")));
	} catch {
		return failure("Only archived variants can be deleted.");
	}
	revalidatePath(`/${workspaceId}/products-services`);
	return success();
}
