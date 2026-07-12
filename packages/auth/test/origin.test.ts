import { describe, expect, it } from "vitest";
import { matchOrigin } from "../src/_origin";

// The CORS allowlist for the auth API is credentialed (cookies), so an
// over-permissive match = account-takeover surface. These lead with the attacks.
const ALLOW = [
	"https://auth.quickengine.xyz",
	"https://quickengine.xyz",
	"https://account.quickengine.xyz",
];
const COOKIE = ".quickengine.xyz";

describe("matchOrigin — auth CORS allowlist", () => {
	it("allows the exact trusted origins", () => {
		for (const origin of ALLOW) {
			expect(matchOrigin(origin, ALLOW, COOKIE)).toBe(true);
		}
	});

	it("allows any real subdomain of the cookie domain", () => {
		expect(matchOrigin("https://admin.quickengine.xyz", ALLOW, COOKIE)).toBe(
			true,
		);
		expect(matchOrigin("https://quickengine.xyz", ALLOW, COOKIE)).toBe(true);
	});

	it("rejects look-alike and hostile origins", () => {
		const hostile = [
			"https://evil.com",
			"https://quickengine.xyz.evil.com", // suffix confusion
			"https://notquickengine.xyz", // no subdomain-boundary dot
			"https://evilquickengine.xyz",
			"https://account.quickengine.xyz.evil.com",
			"http://quickengine.xyz.attacker.io",
			"https://quickengine-xyz.evil.com",
		];
		for (const origin of hostile) {
			expect(matchOrigin(origin, ALLOW, COOKIE)).toBe(false);
		}
	});

	it("rejects empty and malformed origins", () => {
		expect(matchOrigin(null, ALLOW, COOKIE)).toBe(false);
		expect(matchOrigin(undefined, ALLOW, COOKIE)).toBe(false);
		expect(matchOrigin("", ALLOW, COOKIE)).toBe(false);
		expect(matchOrigin("not a url", ALLOW, COOKIE)).toBe(false);
	});

	it("without a cookie domain, only the exact allowlist passes", () => {
		expect(
			matchOrigin("https://account.quickengine.xyz", ALLOW, undefined),
		).toBe(true);
		expect(matchOrigin("https://admin.quickengine.xyz", ALLOW, undefined)).toBe(
			false,
		);
	});
});
