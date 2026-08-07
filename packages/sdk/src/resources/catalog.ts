import type { QuickClient } from "../client";
import type {
	QuickCatalogItem,
	QuickCatalogItemInput,
	QuickCatalogStatus,
	QuickCatalogVariant,
	QuickCatalogVariantInput,
	QuickCategoryInput,
	QuickCategoryNode,
	QuickCursorPage,
	QuickPublicReview,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's catalog — products, services, and their variants. Reached as
 * `quick.catalog`. Reads are one transparent shape; a publishable (storefront) key is clamped to
 * active items server-side, while a secret key or session sees every status.
 */
export class CatalogResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			direction?: "asc" | "desc";
			limit?: number;
			sort?: string;
			status?: QuickCatalogStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickCatalogItem>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.sort) query.set("sort", options.sort);
		if (options.direction) query.set("direction", options.direction);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/catalog${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickCatalogItem>(
			`/catalog/${encodeURIComponent(id)}`,
		);
	}

	listReviews(id: string, limit = 50) {
		const query = new URLSearchParams({ limit: String(limit) });
		return this.client.request<{ items: QuickPublicReview[] }>(
			`/catalog/${encodeURIComponent(id)}/reviews?${query}`,
		);
	}
	create(input: QuickCatalogItemInput, idempotencyKey: string) {
		return this.client.request<QuickCatalogItem>("/catalog", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(
		id: string,
		patch: Partial<QuickCatalogItemInput>,
		idempotencyKey: string,
	) {
		return this.client.request<QuickCatalogItem>(
			`/catalog/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(id: string, status: QuickCatalogStatus, idempotencyKey: string) {
		return this.client.request<QuickCatalogItem>(
			`/catalog/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/catalog/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	listVariants(itemId: string) {
		return this.client.request<QuickCatalogVariant[]>(
			`/catalog/${encodeURIComponent(itemId)}/variants`,
		);
	}
	createVariant(
		itemId: string,
		input: QuickCatalogVariantInput,
		idempotencyKey: string,
	) {
		return this.client.request<QuickCatalogVariant>(
			`/catalog/${encodeURIComponent(itemId)}/variants`,
			{ method: "POST", body: input, idempotencyKey },
		);
	}
	getVariant(id: string) {
		return this.client.request<QuickCatalogVariant>(
			`/variants/${encodeURIComponent(id)}`,
		);
	}
	updateVariant(
		id: string,
		patch: Partial<QuickCatalogVariantInput>,
		idempotencyKey: string,
	) {
		return this.client.request<QuickCatalogVariant>(
			`/variants/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setVariantStatus(
		id: string,
		status: QuickCatalogStatus,
		idempotencyKey: string,
	) {
		return this.client.request<QuickCatalogVariant>(
			`/variants/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	deleteVariant(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/variants/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	// ── Categories and collections ──────────────────────────────────────────
	//
	// How a catalog is arranged for browsing. A category is where a thing
	// belongs; a collection is a curated grouping. They differ in meaning and
	// nothing else, which is why one shape covers both.
	//
	// ⚠️ These live here rather than on `site` because writing them needs an
	// operator. `site.listCategories` is the storefront's read of the same tree.

	/**
	 * The category tree.
	 *
	 * ⚠️ `visibleOnly` defaults to TRUE server-side, because the usual caller is
	 * a storefront rendering navigation. An operator managing categories wants
	 * the hidden ones too, so pass `false`.
	 */
	listCategories(
		options: { kind?: "category" | "collection"; visibleOnly?: boolean } = {},
	) {
		const query = new URLSearchParams();
		if (options.kind) query.set("kind", options.kind);
		if (options.visibleOnly === false) query.set("visibleOnly", "false");
		return this.client.request<{ items: QuickCategoryNode[] }>(
			`/categories${query.size ? `?${query}` : ""}`,
		);
	}

	createCategory(input: QuickCategoryInput, idempotencyKey: string) {
		return this.client.request<QuickCategoryNode>("/categories", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}

	updateCategory(
		id: string,
		patch: Partial<QuickCategoryInput>,
		idempotencyKey: string,
	) {
		return this.client.request<QuickCategoryNode>(
			`/categories/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}

	deleteCategory(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/categories/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	/**
	 * REPLACE which categories an item belongs to.
	 *
	 * Sending `[]` removes it from every category — which is the only way to take
	 * something out of a collection, so it must not be mistaken for a no-op.
	 */
	setItemCategories(
		itemId: string,
		categoryIds: string[],
		idempotencyKey: string,
	) {
		return this.client.request<{ categories: QuickCategoryNode[] }>(
			`/catalog/${encodeURIComponent(itemId)}/categories`,
			{ method: "PUT", body: { categoryIds }, idempotencyKey },
		);
	}
}
