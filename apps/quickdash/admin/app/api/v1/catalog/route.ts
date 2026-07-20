import { listCatalogItems } from "@quickengine/mod-products-services";
import { resolveContext } from "../../_lib/context";
import { ok, requestId } from "../../_lib/respond";

// GET /api/v1/catalog — the published catalog for the scoped workspace. The first route
// of the public v1 API and the first thing a storefront reads. Read-only; only active
// items are exposed, and each row is mapped to a stable public shape rather than leaking
// the raw database record. Reachable by a publishable key (no login) — the storefront
// path — or by a signed-in operator's session.
export async function GET(request: Request): Promise<Response> {
	const id = requestId(request);
	const resolved = await resolveContext(request, id, {
		module: "products-services",
		capability: "catalog:read",
	});
	if ("error" in resolved) {
		return resolved.error;
	}

	const items = await listCatalogItems(resolved.context.workspaceId, "active");
	return ok(
		items.map((item) => ({
			id: item.id,
			name: item.name,
			description: item.description,
			type: item.type,
			sku: item.sku,
			pricingModel: item.pricingModel,
			priceCents: item.priceCents,
			currency: item.currency,
			unitLabel: item.unitLabel,
		})),
		id,
		resolved.context.rateLimitHeaders,
	);
}
