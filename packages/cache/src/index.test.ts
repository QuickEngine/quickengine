import { describe, expect, it } from "vitest";
import { createMemoryCacheProvider } from "./index";

describe("memory cache atomic operations", () => {
	it("acquires a single-flight key exactly once until it expires or is deleted", async () => {
		const cache = createMemoryCacheProvider();

		expect(
			await cache.setIfAbsent("intent", { owner: 1 }, { ttlSeconds: 60 }),
		).toBe(true);
		expect(
			await cache.setIfAbsent("intent", { owner: 2 }, { ttlSeconds: 60 }),
		).toBe(false);
		expect(await cache.get("intent")).toEqual({ owner: 1 });

		await cache.delete("intent");
		expect(
			await cache.setIfAbsent("intent", { owner: 3 }, { ttlSeconds: 60 }),
		).toBe(true);
	});

	it("reports that memory is healthy but not shared across runtimes", async () => {
		const cache = createMemoryCacheProvider();
		await expect(cache.ping()).resolves.toBeUndefined();
		expect(cache.kind).toBe("memory");
		expect(cache.shared).toBe(false);
	});
});
