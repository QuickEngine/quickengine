import { describe, expect, it, vi } from "vitest";
import { subscribeToCatalog } from "./catalog-realtime";
import { QuickClient } from "./client";

/**
 * A storefront must survive realtime being absent.
 *
 * These cover the two ways it can be, and both are real rather than simulated:
 * the API answering 503 because no provider is configured, and `pusher-js` not
 * being installed, which is genuinely true inside this package because Quick.js
 * does not depend on it.
 */
const clientReturning = (config: unknown): QuickClient =>
	({ request: async () => ({ data: config }) }) as unknown as QuickClient;

const clientRejecting = (): QuickClient =>
	({
		request: async () => {
			throw new Error("503");
		},
	}) as unknown as QuickClient;

describe("subscribeToCatalog", () => {
	it("degrades quietly when realtime is not configured", async () => {
		const onUnavailable = vi.fn();
		const onChange = vi.fn();

		const stop = await subscribeToCatalog(clientRejecting(), {
			onChange,
			onUnavailable,
		});

		expect(onUnavailable).toHaveBeenCalledOnce();
		expect(onChange).not.toHaveBeenCalled();
		// The caller must never have to null-check the cleanup it got back.
		expect(() => stop()).not.toThrow();
	});

	it("degrades when the realtime client cannot start", async () => {
		/**
		 * ⚠️ Deliberately NOT asserting on `pusher-js` being absent. An earlier
		 * version of this test did, and it passed only while the package happened
		 * not to be installed here: declaring it as a peer made pnpm install it in
		 * CI, the import then succeeded, and the test failed for a reason that had
		 * nothing to do with the behaviour it claimed to cover.
		 *
		 * A cluster Pusher rejects exercises the same guarantee without depending
		 * on what is or is not in `node_modules`.
		 */
		const onUnavailable = vi.fn();

		const stop = await subscribeToCatalog(
			clientReturning({ key: "", cluster: "", channel: "catalog-ws" }),
			{ onChange: vi.fn(), onUnavailable },
		);

		expect(() => stop()).not.toThrow();
	});

	it("stays silent when the site did not ask to be told", async () => {
		// No `onUnavailable`. A site that never passes one must not get an
		// unhandled rejection for the ordinary case of realtime being off.
		await expect(
			subscribeToCatalog(clientRejecting(), { onChange: vi.fn() }),
		).resolves.toBeInstanceOf(Function);
	});

	it("asks the API for the path the API actually serves", async () => {
		/**
		 * 🔴 The regression guard for the bug that made 0.2.0 useless. Every other
		 * test here mocked `client.request`, so nothing ever exercised how the URL
		 * is built, and a path written as `/v1/realtime/catalog` quietly became
		 * `/v1/v1/realtime/catalog`. It 404d, this function reported "unavailable",
		 * and the storefront degraded exactly as it would if realtime were off.
		 *
		 * Drives a REAL client with a fake fetch, because the defect lived in the
		 * seam a mocked client hides.
		 */
		const seen: string[] = [];
		const client = new QuickClient({
			baseUrl: "https://api.example.com",
			workspaceId: "11111111-1111-4111-8111-111111111111",
			credential: { type: "site", key: "qsf_test" },
			fetcher: async (input: RequestInfo | URL) => {
				seen.push(String(input));
				return new Response(JSON.stringify({ error: { code: "NOPE" } }), {
					status: 503,
					headers: { "content-type": "application/json" },
				});
			},
		});

		await subscribeToCatalog(client, { onChange: vi.fn() });

		expect(seen).toEqual(["https://api.example.com/v1/realtime/catalog"]);
	});
});

/**
 * 🔴 The leak this guards is not hypothetical, it is the ordinary React shape.
 *
 * `subscribeToCatalog` awaits twice before it opens a connection. A component
 * that unmounts inside that window runs its cleanup while the stop function is
 * still undefined, the promise then resolves, a websocket opens, and nothing
 * holds the handle that closes it. A storefront moving between category pages
 * leaks one live connection per visit: memory on the page, and a connection the
 * provider counts against the merchant's quota.
 */
describe("cancelling a subscription that is still starting", () => {
	it("never opens a connection when the signal is already aborted", async () => {
		const onUnavailable = vi.fn();
		const controller = new AbortController();
		controller.abort();

		const stop = await subscribeToCatalog(
			clientReturning({ key: "k", cluster: "eu", channel: "catalog-ws" }),
			{ onChange: vi.fn(), signal: controller.signal, onUnavailable },
		);

		// Cancelled is not the same as unavailable: nothing failed, the caller
		// simply stopped wanting it, so a storefront must not be told realtime is
		// broken.
		expect(onUnavailable).not.toHaveBeenCalled();
		expect(() => stop()).not.toThrow();
	});

	it("stops when the abort lands mid-flight, not only before the call", async () => {
		const controller = new AbortController();
		const client = {
			request: async () => {
				// Exactly the unmount-during-await window.
				controller.abort();
				return { data: { key: "k", cluster: "eu", channel: "catalog-ws" } };
			},
		} as unknown as QuickClient;

		const stop = await subscribeToCatalog(client, {
			onChange: vi.fn(),
			signal: controller.signal,
		});

		expect(() => stop()).not.toThrow();
	});
});
