import { claimIdempotencyKey, releaseIdempotencyKey } from "@quickengine/db";
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

describe("releaseIdempotencyKey", () => {
	// The regression this exists for: a claim says "this caller is doing the work", not
	// "the work succeeded". If the work then fails and the key is NOT released, the user's
	// corrected retry carries the same key, loses the claim, and gets treated as a duplicate
	// no-op — the UI reports success while nothing was ever created.
	it("lets a corrected retry through after the claimed work failed", async () => {
		const key = "idem-key-retry-after-failure";
		const scope = "invoices.create:ws-1";

		// First submit: claims the key, then the work fails (bad input, domain error, …).
		expect(await claimIdempotencyKey(key, scope)).toBe(true);
		await releaseIdempotencyKey(key, scope);

		// The user fixes the form and resubmits with the same key — this must do the work.
		expect(await claimIdempotencyKey(key, scope)).toBe(true);
	});

	it("still rejects a genuine duplicate after a successful claim", async () => {
		const key = "idem-key-no-release";
		const scope = "invoices.create:ws-1";
		expect(await claimIdempotencyKey(key, scope)).toBe(true);
		// No release — the work succeeded, so a replay stays blocked.
		expect(await claimIdempotencyKey(key, scope)).toBe(false);
	});

	it("is scoped: releasing under a different scope leaves the claim intact", async () => {
		const key = "idem-key-scoped-release";
		expect(await claimIdempotencyKey(key, "invoices.create:ws-1")).toBe(true);
		await releaseIdempotencyKey(key, "payments.record:ws-1");
		expect(await claimIdempotencyKey(key, "invoices.create:ws-1")).toBe(false);
	});

	it("is a no-op for an absent key or an unclaimed one", async () => {
		await expect(releaseIdempotencyKey("", "s")).resolves.toBeUndefined();
		await expect(
			releaseIdempotencyKey(undefined, "s"),
		).resolves.toBeUndefined();
		await expect(releaseIdempotencyKey(null, "s")).resolves.toBeUndefined();
		await expect(
			releaseIdempotencyKey("idem-key-never-claimed", "s"),
		).resolves.toBeUndefined();
	});
});
