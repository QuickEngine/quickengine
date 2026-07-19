import { claimIdempotencyKey } from "@quickengine/db";
import { describe, expect, it } from "vitest";

describe("claimIdempotencyKey", () => {
	it("lets the first claim through and rejects duplicates", async () => {
		const key = "idem-key-0001";
		expect(await claimIdempotencyKey(key, "client-records.create:ws-1")).toBe(
			true,
		);
		// Same key again — a retry/replay — is rejected (caller should skip the work).
		expect(await claimIdempotencyKey(key, "client-records.create:ws-1")).toBe(
			false,
		);
	});

	it("treats different keys independently", async () => {
		expect(await claimIdempotencyKey("idem-key-0002", "s")).toBe(true);
		expect(await claimIdempotencyKey("idem-key-0003", "s")).toBe(true);
	});

	it("opts out (returns true) when no key is provided", async () => {
		expect(await claimIdempotencyKey("", "s")).toBe(true);
		expect(await claimIdempotencyKey(undefined, "s")).toBe(true);
		expect(await claimIdempotencyKey(null, "s")).toBe(true);
	});

	it("is race-safe: concurrent claims of one key yield exactly one winner", async () => {
		const key = "idem-key-race";
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				claimIdempotencyKey(key, "client-records.create:ws-1"),
			),
		);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
});
