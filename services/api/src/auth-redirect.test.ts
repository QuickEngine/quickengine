import { describe, expect, it } from "vitest";
import { resolveSignOutDestination } from "./auth-redirect";

const env = {
	QUICKDASH_ADMIN_URL: "https://quickdash.xyz",
	QUICKENGINE_ACCOUNT_URL: "https://account.quickdash.xyz",
	QUICKENGINE_AUTH_URL: "https://auth.quickdash.xyz",
	QUICKENGINE_WEB_URL: "https://quickengine.xyz",
};

describe("resolveSignOutDestination", () => {
	it("preserves paths on exact first-party origins", () => {
		expect(
			resolveSignOutDestination("https://quickdash.xyz/workspace", env),
		).toBe("https://quickdash.xyz/workspace");
		expect(resolveSignOutDestination("/settings", env)).toBe(
			"https://account.quickdash.xyz/settings",
		);
	});

	it.each([
		"https://quickdash.xyz.evil.example",
		"https://evil.example/?next=https://quickdash.xyz",
		"javascript:alert(1)",
		"//evil.example/path",
		"http://[",
	])("falls back for an untrusted redirect: %s", (redirect) => {
		expect(resolveSignOutDestination(redirect, env)).toBe(
			"https://account.quickdash.xyz",
		);
	});
});
