import { describe, expect, it } from "vitest";
import { tagFor } from "./shopify";

/**
 * The correlation tag Shopify will actually accept.
 *
 * 🔴 Shopify refuses an order whose tag exceeds 40 characters, answering
 * `Order tags is invalid` without naming the rule. `qd-po-` plus a 36-character
 * uuid is 42, so every Shopify supplier order was refused and the purchase order
 * was marked failed with "The supplier's system did not accept this order."
 * Nothing in that chain mentions a tag.
 *
 * Found 2026-08-29 on a real store, two days before the first supplier test,
 * by replaying the mutation: 42 characters refused, the same key at 40 accepted.
 */

const realKey = "qd-po-0105c3b4-1056-4ea4-b80a-8a0d6e078b64";

describe("the Shopify correlation tag", () => {
	it("fits inside Shopify's 40 character limit", () => {
		expect(realKey.length).toBe(42); // the value that was actually refused
		expect(tagFor(realKey).length).toBeLessThanOrEqual(40);
	});

	it("keeps the key readable and recognisable", () => {
		// Asserted as a derivation rather than a retyped literal: a hand-copied
		// uuid proves nothing and is how this test first failed.
		expect(tagFor(realKey)).toBe(realKey.replace(/-/g, ""));
		expect(tagFor(realKey)).toMatch(/^qdpo[0-9a-f]+$/);
	});

	/** ⚠️ Same key in, same tag out — the duplicate guard depends on it. */
	it("is stable, so a retry finds the order it already placed", () => {
		expect(tagFor(realKey)).toBe(tagFor(realKey));
	});

	/** A different purchase order must never collide with another. */
	it("distinguishes two purchase orders", () => {
		const a = "qd-po-0105c3b4-1056-4ea4-b80a-8a0d6e078b64";
		const b = "qd-po-0105c3b4-1056-4ea4-b80a-8a0d6e078b65";
		expect(tagFor(a)).not.toBe(tagFor(b));
	});

	/** The belt: a longer key from a future caller still cannot break placement. */
	it("truncates anything a future caller invents", () => {
		expect(tagFor(`qd-po-${"a".repeat(90)}`).length).toBe(40);
	});
});
