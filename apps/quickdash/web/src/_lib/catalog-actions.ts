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
});

export function saveCatalogItemAction(
	_previous: CatalogActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	const id = String(form.get("itemId") ?? "");
	const input = itemInput(form);
	return actionResult(
		() =>
			id
				? api.catalog.update(id, input, idempotencyKey(form))
				: api.catalog.create(input, idempotencyKey(form)),
		"We couldn't save this catalog record.",
	);
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
	const input = variantInput(form);
	return actionResult(
		() =>
			variantId
				? api.catalog.updateVariant(variantId, input, idempotencyKey(form))
				: api.catalog.createVariant(
						String(form.get("itemId") ?? ""),
						input,
						idempotencyKey(form),
					),
		"We couldn't save this variant.",
	);
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
