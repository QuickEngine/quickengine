import { beforeEach, describe, expect, it } from "vitest";
import {
	forgetShopifyToken,
	resolveAccessToken,
	shopifyGraphQL,
} from "./shopify-client";

/**
 * Where a Shopify token comes from.
 *
 * 🔴 Shopify deprecated admin-created custom apps, and with them the permanent
 * `shpat_…` token this adapter was built against. A Dev Dashboard app holds a
 * client id and secret and exchanges them for a token that **expires in 24
 * hours**. Storing a minted token is a bug with a one-day fuse: it works the
 * evening it is pasted in and 401s the next morning, which is exactly when
 * somebody is watching.
 *
 * Found on 2026-08-28 while connecting Caffeinate's supplier bridge, two days
 * before the first supplier test.
 */

const base = {
	shopDomain: "hka0i1-xt.myshopify.com",
	apiVersion: "2026-07",
};

/** Records every request so a test can assert what was actually sent. */
function recorder(replies: Array<Record<string, unknown>>) {
	const calls: Array<{ url: string; body: string }> = [];
	let index = 0;
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), body: String(init?.body ?? "") });
		const reply = replies[index++] ?? {};
		return {
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => reply,
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

beforeEach(() => {
	forgetShopifyToken(base.shopDomain, "client_abc");
});

describe("resolving a Shopify access token", () => {
	it("exchanges client credentials for a token", async () => {
		const { fetchImpl, calls } = recorder([
			{ access_token: "minted_token", expires_in: 86_399 },
		]);

		const token = await resolveAccessToken({
			...base,
			clientId: "client_abc",
			clientSecret: "secret_xyz",
			fetchImpl,
		});

		expect(token).toBe("minted_token");
		expect(calls[0]?.url).toBe(
			"https://hka0i1-xt.myshopify.com/admin/oauth/access_token",
		);
		// The grant Shopify documents, form-encoded.
		expect(calls[0]?.body).toContain("grant_type=client_credentials");
		expect(calls[0]?.body).toContain("client_id=client_abc");
		expect(calls[0]?.body).toContain("client_secret=secret_xyz");
	});

	/** ⚠️ One mint per day, not one per order. */
	it("caches the token instead of minting one per call", async () => {
		const { fetchImpl, calls } = recorder([
			{ access_token: "minted_token", expires_in: 86_399 },
		]);
		const config = {
			...base,
			clientId: "client_abc",
			clientSecret: "secret_xyz",
			fetchImpl,
		};

		await resolveAccessToken(config);
		await resolveAccessToken(config);
		await resolveAccessToken(config);

		expect(calls).toHaveLength(1);
	});

	/**
	 * 🔴 A token that expires in flight reads as a 401, so it is refreshed a
	 * minute early. An `expires_in` inside that margin must NOT be cached.
	 */
	it("does not reuse a token already inside the refresh margin", async () => {
		const { fetchImpl, calls } = recorder([
			{ access_token: "first", expires_in: 30 },
			{ access_token: "second", expires_in: 86_399 },
		]);
		const config = {
			...base,
			clientId: "client_abc",
			clientSecret: "secret_xyz",
			fetchImpl,
		};

		expect(await resolveAccessToken(config)).toBe("first");
		expect(await resolveAccessToken(config)).toBe("second");
		expect(calls).toHaveLength(2);
	});

	/** Stores connected before the deprecation must keep working untouched. */
	it("prefers a legacy permanent token and never calls the grant", async () => {
		const { fetchImpl, calls } = recorder([]);

		const token = await resolveAccessToken({
			...base,
			adminAccessToken: "shpat_legacy",
			clientId: "client_abc",
			clientSecret: "secret_xyz",
			fetchImpl,
		});

		expect(token).toBe("shpat_legacy");
		expect(calls).toHaveLength(0);
	});

	it("refuses a connection carrying no usable credential", async () => {
		await expect(resolveAccessToken({ ...base })).rejects.toThrow(
			/access token/i,
		);
	});

	/**
	 * 🔴 The whole point: a GraphQL call mints a token first and sends THAT,
	 * not a stored one.
	 */
	it("sends the minted token on the GraphQL call", async () => {
		const calls: Array<{ url: string; token: string | undefined }> = [];
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			calls.push({
				url: String(url),
				token: headers["X-Shopify-Access-Token"],
			});
			const isGrant = String(url).includes("/admin/oauth/access_token");
			return {
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () =>
					isGrant
						? { access_token: "minted_token", expires_in: 86_399 }
						: { data: { ok: true } },
			} as unknown as Response;
		}) as unknown as typeof fetch;

		await shopifyGraphQL(
			{
				...base,
				clientId: "client_abc",
				clientSecret: "secret_xyz",
				fetchImpl,
			},
			"probe",
			"query { shop { name } }",
			{},
		);

		expect(calls[0]?.url).toContain("/admin/oauth/access_token");
		expect(calls[1]?.url).toContain("/admin/api/2026-07/graphql.json");
		expect(calls[1]?.token).toBe("minted_token");
	});
});
