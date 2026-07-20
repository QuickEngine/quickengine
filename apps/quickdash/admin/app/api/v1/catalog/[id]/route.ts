import {
	getCatalogItem,
	listProductVariants,
} from "@quickengine/mod-products-services";
import { resolveContext } from "../../../_lib/context";
import { fail, ok, requestId } from "../../../_lib/respond";

// GET /api/v1/catalog/:id — a single active catalog item with its active variants, for a
// storefront product-detail page. Only active items and variants are exposed (a draft or
// archived item reads as not-found, never leaked); each row is mapped to the same stable
// public shape as the list route, plus the variant array.
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const id = requestId(request);
	const resolved = await resolveContext(request, id, {
		module: "products-services",
		capability: "catalog:read",
	});
	if ("error" in resolved) {
		return resolved.error;
	}

	const { id: itemId } = await params;
	const item = await getCatalogItem(resolved.context.workspaceId, itemId);
	if (item?.status !== "active") {
		return fail("not_found", "No active catalog item with that id.", 404, id);
	}

	const variants = await listProductVariants(
		resolved.context.workspaceId,
		itemId,
	);

	return ok(
		{
			id: item.id,
			name: item.name,
			description: item.description,
			type: item.type,
			sku: item.sku,
			pricingModel: item.pricingModel,
			priceCents: item.priceCents,
			currency: item.currency,
			unitLabel: item.unitLabel,
			variants: variants
				.filter((variant) => variant.status === "active")
				.map((variant) => ({
					id: variant.id,
					options: variant.options,
					sku: variant.sku,
					priceCentsOverride: variant.priceCentsOverride,
				})),
		},
		id,
		resolved.context.rateLimitHeaders,
	);
}
