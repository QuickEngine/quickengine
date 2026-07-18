import type { QuickClient } from "../client";
import type {
	QuickCatalogItem,
	QuickCatalogItemDetail,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's published catalog — the first Quick.js resource.
 * Reached as `quick.catalog` on any client (discord.js-style resource namespaces).
 */
export class CatalogResource {
	constructor(private readonly client: QuickClient) {}

	/** Active catalog items for the scoped workspace. Read-only. */
	list(): Promise<QuickResponse<QuickCatalogItem[]>> {
		return this.client.request<QuickCatalogItem[]>("/catalog");
	}

	/** A single active catalog item with its active variants. Read-only. */
	get(id: string): Promise<QuickResponse<QuickCatalogItemDetail>> {
		return this.client.request<QuickCatalogItemDetail>(
			`/catalog/${encodeURIComponent(id)}`,
		);
	}
}
