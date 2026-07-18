import {
	issueApiKey,
	listApiKeys,
	revokeApiKey,
	verifyApiKey,
} from "@quickengine/auth/api-keys";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "key-owner";
const workspaceId = "00000000-0000-4000-8000-0000000d0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000d0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Key Owner', 'keys@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Key Workspace', 'ecommerce')
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'ecommerce')
	`;
});

describe("API key issuance + verification", () => {
	it("issues a publishable key, stores only a hash, and verifies it", async () => {
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Storefront",
			type: "publishable",
			capabilities: ["catalog:read"],
		});

		expect(issued.plaintext.startsWith("qpk_")).toBe(true);
		expect(issued.prefix.startsWith("qpk_")).toBe(true);
		expect(issued.capabilities).toEqual(["catalog:read"]);

		// The raw key is never persisted — only its sha256 hash.
		const sql = testDbClient();
		const [row] = await sql<{ key_hash: string; prefix: string }[]>`
			select key_hash, prefix from quickengine_api_keys where id = ${issued.id}
		`;
		expect(row?.key_hash).not.toContain(issued.plaintext);
		expect(row?.key_hash).toHaveLength(64); // sha256 hex

		const verified = await verifyApiKey(issued.plaintext);
		expect(verified).toMatchObject({
			workspaceId,
			type: "publishable",
			capabilities: ["catalog:read"],
		});
	});

	it("drops unknown capabilities at issuance", async () => {
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Filtered",
			type: "secret",
			capabilities: ["catalog:read", "totally:bogus"],
		});
		expect(issued.capabilities).toEqual(["catalog:read"]);
	});

	it("rejects an unknown key", async () => {
		expect(await verifyApiKey("qpk_does_not_exist")).toBeNull();
		expect(await verifyApiKey("   ")).toBeNull();
	});

	it("rejects an expired key", async () => {
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Expired",
			type: "secret",
			capabilities: ["catalog:read"],
			expiresAt: new Date(Date.now() - 1_000),
		});
		expect(await verifyApiKey(issued.plaintext)).toBeNull();
	});

	it("revokes a key immediately and idempotently, scoped to its workspace", async () => {
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Revocable",
			type: "scoped",
			capabilities: ["catalog:read"],
		});
		expect(await verifyApiKey(issued.plaintext)).not.toBeNull();

		// A different workspace cannot revoke this key.
		expect(await revokeApiKey(otherWorkspaceId, issued.id)).toBe(false);
		expect(await verifyApiKey(issued.plaintext)).not.toBeNull();

		// The owning workspace revokes it; the next request fails.
		expect(await revokeApiKey(workspaceId, issued.id)).toBe(true);
		expect(await verifyApiKey(issued.plaintext)).toBeNull();

		// Revoking again is a no-op.
		expect(await revokeApiKey(workspaceId, issued.id)).toBe(false);
	});

	it("lists a workspace's keys as non-secret metadata, newest first", async () => {
		await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "First",
			type: "publishable",
			capabilities: ["catalog:read"],
		});
		await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Second",
			type: "secret",
			capabilities: ["catalog:read"],
		});

		const keys = await listApiKeys(workspaceId);
		expect(keys.map((key) => key.name)).toEqual(["Second", "First"]);
		// The listing never carries a usable secret.
		for (const key of keys) {
			expect(Object.hasOwn(key, "keyHash")).toBe(false);
			expect(Object.hasOwn(key, "plaintext")).toBe(false);
		}
	});
});
