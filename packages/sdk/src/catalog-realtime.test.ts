import { describe, expect, it, vi } from "vitest";
import { subscribeToCatalog } from "./catalog-realtime";
import type { QuickClient } from "./client";

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

	it("says so when the site has not installed the realtime client", async () => {
		const onUnavailable = vi.fn();

		const stop = await subscribeToCatalog(
			clientReturning({ key: "k", cluster: "us2", channel: "catalog-ws" }),
			{ onChange: vi.fn(), onUnavailable },
		);

		expect(onUnavailable).toHaveBeenCalledWith(
			expect.stringContaining("pusher-js"),
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
});
