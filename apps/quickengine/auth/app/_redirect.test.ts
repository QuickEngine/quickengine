import { describe, expect, it } from "vitest";
import { type RedirectConfig, resolveRedirect } from "./_redirect";

// Mirrors the real allow-list shape (our three apps), with the auth app as base.
const config: RedirectConfig = {
	allowedOrigins: [
		"http://localhost:3000", // web
		"http://localhost:3001", // dashboard
		"http://localhost:3002", // auth
	],
	base: "http://localhost:3002",
	fallback: "http://localhost:3001",
};
const resolve = (r: string | null | undefined) => resolveRedirect(r, config);

describe("resolveRedirect — open-redirect guard", () => {
	// ── Attack cases: an untrusted target must NEVER be honored ──────────────
	it.each([
		["a plain external origin", "https://evil.com"],
		["an external origin with a convincing path", "https://evil.com/dashboard"],
		["a protocol-relative //host", "//evil.com"],
		[
			"userinfo confusion (our host as credentials)",
			"http://localhost:3001@evil.com",
		],
		[
			"a look-alike subdomain of our host",
			"http://localhost.evil.com/dashboard",
		],
		["a scheme mismatch (https vs our http origin)", "https://localhost:3001"],
		["a javascript: payload", "javascript:alert(document.cookie)"],
		["a data: payload", "data:text/html,<script>alert(1)</script>"],
	])("falls back on %s", (_label, target) => {
		expect(resolve(target)).toBe(config.fallback);
	});

	it("falls back on empty, null, or undefined", () => {
		expect(resolve("")).toBe(config.fallback);
		expect(resolve(null)).toBe(config.fallback);
		expect(resolve(undefined)).toBe(config.fallback);
	});

	// A crafted target that resolves onto our OWN origin is safe by definition —
	// it must never escape to an attacker's origin.
	it("never returns a non-allow-listed origin, even for odd input", () => {
		for (const target of [
			"https://evil.com",
			"//evil.com",
			"http://localhost:3001@evil.com",
			"http://localhost.evil.com",
			"javascript:alert(1)",
		]) {
			const out = new URL(resolve(target));
			expect(config.allowedOrigins).toContain(out.origin);
		}
	});

	// ── Legit cases: our own apps ARE honored ────────────────────────────────
	it("allows an absolute URL on each allow-listed origin", () => {
		expect(resolve("http://localhost:3001/settings")).toBe(
			"http://localhost:3001/settings",
		);
		expect(resolve("http://localhost:3000/pricing")).toBe(
			"http://localhost:3000/pricing",
		);
		expect(resolve("http://localhost:3002/verify")).toBe(
			"http://localhost:3002/verify",
		);
	});

	it("resolves a relative path against our own (allow-listed) base", () => {
		expect(resolve("/reset?token=abc")).toBe(
			"http://localhost:3002/reset?token=abc",
		);
	});
});
