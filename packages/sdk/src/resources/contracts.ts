import type { QuickClient } from "../client";
import type {
	QuickContract,
	QuickContractInput,
	QuickContractSendResult,
	QuickContractStatus,
	QuickCursorPage,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's contracts. Reached as `quick.contracts`.
 *
 * Signing tokens are never exposed through this API. Sending a contract returns invitation
 * metadata only; the signing links themselves are delivered out of band, because a token is a
 * credential for the public signing page.
 */
export class ContractsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			direction?: "asc" | "desc";
			limit?: number;
			sort?: string;
			clientId?: string;
			status?: QuickContractStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickContract>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.sort) query.set("sort", options.sort);
		if (options.direction) query.set("direction", options.direction);
		if (options.clientId) query.set("clientId", options.clientId);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/contracts${query.size ? `?${query}` : ""}`);
	}

	/** Returns the contract with its signers. Signer token material is never included. */
	get(id: string) {
		return this.client.request<QuickContract>(
			`/contracts/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickContractInput, idempotencyKey: string) {
		return this.client.request<QuickContract>("/contracts", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	/** Only a draft contract can be edited. */
	update(id: string, patch: QuickContractInput, idempotencyKey: string) {
		return this.client.request<QuickContract>(
			`/contracts/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	/** Mints a signing link per signer; the response carries invitation metadata only. */
	send(
		id: string,
		idempotencyKey: string,
		options: { actorId?: string; expiresAt?: Date | string } = {},
	) {
		return this.client.request<QuickContractSendResult>(
			`/contracts/${encodeURIComponent(id)}/send`,
			{ method: "POST", body: options, idempotencyKey },
		);
	}
	expire(id: string, idempotencyKey: string) {
		return this.client.request<QuickContract>(
			`/contracts/${encodeURIComponent(id)}/expire`,
			{ method: "POST", idempotencyKey },
		);
	}
	void(id: string, idempotencyKey: string) {
		return this.client.request<QuickContract>(
			`/contracts/${encodeURIComponent(id)}/void`,
			{ method: "POST", idempotencyKey },
		);
	}
	/** Supersedes this contract with a new revision. */
	revise(id: string, idempotencyKey: string) {
		return this.client.request<QuickContract>(
			`/contracts/${encodeURIComponent(id)}/revise`,
			{ method: "POST", idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/contracts/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
