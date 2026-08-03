import { afterEach, describe, expect, it } from "vitest";
import { isOwnOrigin } from "./payments-routes";

/**
 * The open-redirect guard on Connect onboarding.
 *
 * 🔴 Worth its own test file. The operator arrives at `returnUrl` straight from
 * a payment provider's hosted page, having just been asked for bank details. A
 * redirect an attacker chose, reached from that context, is the most credible
 * phishing page you could construct against a business owner.
 *
 * Every case below is a real bypass of the naive `startsWith("https://quickdash.xyz")`
 * check, which is exactly what this function exists instead of.
 */
describe("Connect redirect allowlist", () => {
	const originalEnv = process.env.NODE_ENV;
	afterEach(() => {
		process.env.NODE_ENV = originalEnv;
	});

	it("accepts our own hosts over https", () => {
		expect(isOwnOrigin("https://quickdash.xyz/settings")).toBe(true);
		expect(isOwnOrigin("https://account.quickdash.xyz/payments")).toBe(true);
		expect(isOwnOrigin("https://portal.quickdash.xyz/x")).toBe(true);
	});

	it("rejects a lookalike domain that merely starts with ours", () => {
		// `startsWith` says yes. The origin is evil.com.
		expect(isOwnOrigin("https://quickdash.xyz.evil.com/steal")).toBe(false);
	});

	it("rejects userinfo smuggling", () => {
		// Reads as our domain to a human; the host is evil.com.
		expect(isOwnOrigin("https://quickdash.xyz@evil.com/steal")).toBe(false);
	});

	it("rejects a domain that merely ends with ours without a dot boundary", () => {
		expect(isOwnOrigin("https://notquickdash.xyz/x")).toBe(false);
	});

	it("rejects non-http schemes", () => {
		expect(isOwnOrigin("javascript:alert(1)")).toBe(false);
		expect(isOwnOrigin("data:text/html,<script>alert(1)</script>")).toBe(false);
	});

	it("rejects unparseable input rather than throwing", () => {
		expect(isOwnOrigin("not a url")).toBe(false);
		expect(isOwnOrigin("")).toBe(false);
	});

	it("refuses plain http even on our own domain", () => {
		// A downgrade is a place to intercept the operator mid-onboarding.
		expect(isOwnOrigin("http://account.quickdash.xyz/x")).toBe(false);
	});

	it("allows localhost in development only", () => {
		process.env.NODE_ENV = "development";
		expect(isOwnOrigin("http://localhost:3011/x")).toBe(true);
		expect(isOwnOrigin("http://127.0.0.1:3011/x")).toBe(true);

		process.env.NODE_ENV = "production";
		expect(isOwnOrigin("http://localhost:3011/x")).toBe(false);
		expect(isOwnOrigin("http://127.0.0.1:3011/x")).toBe(false);
	});
});
