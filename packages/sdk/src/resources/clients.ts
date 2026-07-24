import type { QuickClient } from "../client";
import type {
	QuickClientAddress,
	QuickClientAddressInput,
	QuickClientInput,
	QuickClientRecord,
	QuickCursorPage,
	QuickResponse,
} from "../types";

export class ClientsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: { cursor?: string; limit?: number } = {},
	): Promise<QuickResponse<QuickCursorPage<QuickClientRecord>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		return this.client.request(`/clients${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickClientRecord>(
			`/clients/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickClientInput, idempotencyKey: string) {
		return this.client.request<QuickClientRecord>("/clients", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: Partial<QuickClientInput>, idempotencyKey: string) {
		return this.client.request<QuickClientRecord>(
			`/clients/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/clients/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
	listAddresses(clientId: string) {
		return this.client.request<QuickClientAddress[]>(
			`/clients/${encodeURIComponent(clientId)}/addresses`,
		);
	}
	createAddress(
		clientId: string,
		input: QuickClientAddressInput,
		idempotencyKey: string,
	) {
		return this.client.request<QuickClientAddress>(
			`/clients/${encodeURIComponent(clientId)}/addresses`,
			{ method: "POST", body: input, idempotencyKey },
		);
	}
	getAddress(id: string) {
		return this.client.request<QuickClientAddress>(
			`/addresses/${encodeURIComponent(id)}`,
		);
	}
	updateAddress(
		id: string,
		patch: Partial<QuickClientAddressInput>,
		idempotencyKey: string,
	) {
		return this.client.request<QuickClientAddress>(
			`/addresses/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	deleteAddress(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/addresses/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
