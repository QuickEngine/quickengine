import { describe, expect, it } from "vitest";
import { accountLinkingPolicy } from "../src/server";

// Social sign-in (Google/GitHub) and the OAuth callback are wired and work
// manually, but a real provider round-trip can't be driven from an integration
// test — it needs a browser and the provider's consent screen. Covered in
// Playwright once the post-auth landing app exists.
describe("social OAuth", () => {
	it("links a same-email identity only from a provider that verifies it", () => {
		// 🔑 The guarantee this asserts is not "linking is off" but "linking is
		// off for anyone who has not PROVEN the address". An unverified email is a
		// claim, and honouring it hands over the account behind it.
		expect(accountLinkingPolicy).toEqual({
			enabled: true,
			disableImplicitLinking: false,
			trustedProviders: ["google"],
		});
	});

	it("never trusts a provider that can assert an unverified address", () => {
		// ⚠️ A guard, not a restatement. GitHub can expose addresses it has not
		// verified, so adding it here would reopen exactly the hole the trusted
		// list exists to close, and it would look like a harmless one-word edit.
		expect(accountLinkingPolicy.trustedProviders).not.toContain("github");
	});

	it.todo("completes the Google OAuth callback into a session (Playwright)");
	it.todo("completes the GitHub OAuth callback into a session (Playwright)");
});
