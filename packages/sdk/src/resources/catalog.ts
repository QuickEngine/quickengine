import type { QuickClient } from "../client";
import type {
	QuickCatalogItem,
	QuickCatalogItemInput,
	QuickCatalogStatus,
	QuickCatalogVariant,
	QuickCatalogVariantInput,
	QuickCursorPage,
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
			limit?: number;
			status?: QuickCatalogStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickCatalogItem>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.status) query.set("status", options.status);
		return this.client.request(`/catalog${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickCatalogItem>(
			`/catalog/${encodeURIComponent(id)}`,
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
}
