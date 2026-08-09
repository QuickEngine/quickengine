import type { QuickCatalogStatus } from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import {
	type ActionState,
	actionResult,
	cents,
	idempotencyKey,
} from "./action-result";

export type CatalogActionState = ActionState;

const itemInput = (form: FormData) => {
	const pricingModel = String(form.get("pricingModel")) as
		| "fixed"
		| "starting_at"
		| "hourly"
		| "custom_quote"
		| "free";
	return {
		name: String(form.get("name") ?? ""),
		description: String(form.get("description") ?? "") || null,
		type: String(form.get("type")) as
			| "physical"
			| "digital"
			| "service"
			| "package"
			| "rental",
		sku: String(form.get("sku") ?? "") || null,
		pricingModel,
		priceCents: ["custom_quote", "free"].includes(pricingModel)
			? null
			: cents(form.get("price")),
		currency: String(form.get("currency") ?? "USD"),
		unitLabel: String(form.get("unitLabel") ?? "") || null,
		weightGrams: form.get("weightGrams")
			? Number(form.get("weightGrams"))
			: null,
	};
};

const variantInput = (form: FormData) => ({
	options: String(form.get("options") ?? "")
		.split(",")
		.filter(Boolean)
		.map((part) => {
			const [name, ...value] = part.split(":");
			return { name: name?.trim() ?? "", value: value.join(":").trim() };
		}),
	sku: String(form.get("sku") ?? "") || null,
	priceCentsOverride: cents(form.get("priceOverride")),
	weightGramsOverride: form.get("weightGramsOverride")
		? Number(form.get("weightGramsOverride"))
		: null,
});

export function saveCatalogItemAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("itemId") ?? "");
	return actionResult(() => {
		const input = itemInput(form);
		return id
			? api.catalog.update(id, input, idempotencyKey(form))
			: api.catalog.create(input, idempotencyKey(form));
	}, "We couldn't save this catalog record.");
}

export function changeCatalogItemStatusAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.setStatus(
				String(form.get("itemId") ?? ""),
				String(form.get("target")) as QuickCatalogStatus,
				idempotencyKey(form),
			),
		"We couldn't change this catalog status.",
	);
}

export function deleteCatalogItemAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.delete(
				String(form.get("itemId") ?? ""),
				idempotencyKey(form),
			),
		"We couldn't delete this catalog record.",
	);
}

export function saveVariantAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const variantId = String(form.get("variantId") ?? "");
	return actionResult(() => {
		const input = variantInput(form);
		return variantId
			? api.catalog.updateVariant(variantId, input, idempotencyKey(form))
			: api.catalog.createVariant(
					String(form.get("itemId") ?? ""),
					input,
					idempotencyKey(form),
				);
	}, "We couldn't save this variant.");
}

export function changeVariantStatusAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.setVariantStatus(
				String(form.get("variantId") ?? ""),
				String(form.get("target")) as QuickCatalogStatus,
				idempotencyKey(form),
			),
		"We couldn't change this variant status.",
	);
}

export function deleteVariantAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.deleteVariant(
				String(form.get("variantId") ?? ""),
				idempotencyKey(form),
			),
		"We couldn't delete this variant.",
	);
}

// ── Categories ─────────────────────────────────────────────────────────────

/**
 * A slug the storefront can put in a URL.
 *
 * Derived from the name when the operator does not supply one, because being
 * made to invent a slug is a strange first question to ask somebody who just
 * wants a "Rings" category.
 */
const slugify = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export function saveCategoryAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("categoryId") ?? "");
	const name = String(form.get("name") ?? "").trim();
	const slug = String(form.get("slug") ?? "").trim() || slugify(name);
	const input = {
		kind: (String(form.get("kind") ?? "category") === "collection"
			? "collection"
			: "category") as "category" | "collection",
		name,
		slug,
		description: String(form.get("description") ?? "") || null,
		visible: form.get("visible") !== null,
	};
	return actionResult(
		() =>
			id
				? api.catalog.updateCategory(id, input, idempotencyKey(form))
				: api.catalog.createCategory(input, idempotencyKey(form)),
		"We couldn't save this category.",
	);
}

export function deleteCategoryAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.deleteCategory(
				String(form.get("categoryId") ?? ""),
				idempotencyKey(form),
			),
		"We couldn't delete this category.",
	);
}

/**
 * Replace which categories an item belongs to.
 *
 * ⚠️ Reads EVERY checked box, so an unchecked one is a removal. That is the
 * only way to take a product out of a category, and it is why the form must
 * always submit the complete set rather than a delta.
 */
export function setItemCategoriesAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.catalog.setItemCategories(
				String(form.get("itemId") ?? ""),
				form.getAll("categoryId").map(String).filter(Boolean),
				idempotencyKey(form),
			),
		"We couldn't update this item's categories.",
	);
}
