import { describe, expect, it } from "vitest";
import { auth } from "./helpers";

describe("email verification", () => {
	it("rejects a garbage verification token", async () => {
		await expect(
			auth.api.verifyEmail({ query: { token: "not-a-real-token" } }),
		).rejects.toThrow();
	});

	// The real flow signs a JWT into the emailed link; exercising it end to end
	// means clicking that link, which belongs in a browser test.
	it.todo(
		"verifies the account via the real emailed link (Playwright — needs the email)",
	);
});
