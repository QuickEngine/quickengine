import { describe, expect, it } from "vitest";
import { accountLinkingPolicy } from "../src/server";

// Social sign-in (Google/GitHub) and the OAuth callback are wired and work
// manually, but a real provider round-trip can't be driven from an integration
// test — it needs a browser and the provider's consent screen. Covered in
// Playwright once the post-auth landing app exists.
describe("social OAuth", () => {
	it("does not implicitly link a same-email OAuth identity", () => {
		expect(accountLinkingPolicy).toEqual({
			enabled: true,
			disableImplicitLinking: true,
		});
	});

	it.todo("completes the Google OAuth callback into a session (Playwright)");
	it.todo("completes the GitHub OAuth callback into a session (Playwright)");
});
