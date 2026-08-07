import {
	issueApiKey,
	listApiKeys,
	revokeApiKey,
	setApiKeyAllowedOrigins,
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

	it("lets a publishable key hold website-safe writes (events:write)", async () => {
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Storefront telemetry",
			type: "publishable",
			capabilities: ["catalog:read", "events:write"],
		});
		expect(issued.capabilities).toEqual(["catalog:read", "events:write"]);

		const verified = await verifyApiKey(issued.plaintext);
		expect(verified?.capabilities).toEqual(["catalog:read", "events:write"]);
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

/**
 * Which websites may present a key.
 *
 * 🔴 Until this shipped there was no way to set an origin except writing to the
 * database by hand — so a storefront key created through the product worked from
 * nowhere, because `isRegisteredStorefrontOrigin` matches the `Origin` header
 * against exactly this list.
 */
describe("a key's allowed origins", () => {
	const storefront = () =>
		issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Storefront",
			type: "storefront",
			capabilities: ["catalog:read"],
			// Deliberately messy: mixed case with a path, an unparseable value, and
			// a second spelling of the same origin. Normalisation happens inside
			// `issueApiKey`, so a caller cannot bypass it by forgetting.
			allowedOrigins: [
				"https://Gemsutopia.ca/shop/",
				"not a url",
				"https://gemsutopia.ca",
			],
		});

	it("normalises what is stored, and drops what could never match", async () => {
		const issued = await storefront();
		const [key] = await listApiKeys(workspaceId);

		// Lowercased, path and trailing slash removed, deduplicated against the
		// second spelling of the same origin — and the unparseable entry is gone
		// rather than sitting in the row looking configured.
		expect(key.allowedOrigins).toEqual(["https://gemsutopia.ca"]);

		const verified = await verifyApiKey(issued.plaintext);
		expect(verified?.allowedOrigins).toEqual(["https://gemsutopia.ca"]);
	});

	it("replaces the list rather than adding to it", async () => {
		const issued = await storefront();

		// 🔴 The operation that matters: cutting off a domain you no longer
		// control. A merge would make that impossible through the API.
		expect(
			await setApiKeyAllowedOrigins(workspaceId, issued.id, [
				"https://newsite.example",
			]),
		).toEqual(["https://newsite.example"]);

		const [key] = await listApiKeys(workspaceId);
		expect(key.allowedOrigins).toEqual(["https://newsite.example"]);
	});

	it("🔴 refuses a key belonging to another workspace", async () => {
		const issued = await storefront();
		// Indistinguishable from a key that does not exist — a caller cannot use
		// this to confirm somebody else's key id is real.
		expect(
			await setApiKeyAllowedOrigins(otherWorkspaceId, issued.id, [
				"https://attacker.example",
			]),
		).toBeNull();

		const [key] = await listApiKeys(workspaceId);
		expect(key.allowedOrigins).toEqual(["https://gemsutopia.ca"]);
	});

	it("refuses to edit a revoked key", async () => {
		const issued = await storefront();
		await revokeApiKey(workspaceId, issued.id);

		// Re-pointing a dead credential at a new domain would read as re-enabling
		// it. The key stays dead.
		expect(
			await setApiKeyAllowedOrigins(workspaceId, issued.id, [
				"https://newsite.example",
			]),
		).toBeNull();
	});

	it("defaults to no origins, which is a key no website can use", async () => {
		// The honest default. A server key needs none; a browser key without them
		// is refused everywhere, which is what the Connect flow exists to prevent.
		const issued = await issueApiKey({
			workspaceId,
			createdByUserId: ownerId,
			name: "Server",
			type: "secret",
			capabilities: ["catalog:read"],
		});
		const verified = await verifyApiKey(issued.plaintext);
		expect(verified?.allowedOrigins).toEqual([]);
	});
});
