import { describe, expect, it } from "vitest";
import { auth, createVerifiedUser } from "./helpers";

describe("passkeys", () => {
	it("listing passkeys requires an authenticated session", async () => {
		await expect(
			auth.api.listPasskeys({ headers: new Headers() }),
		).rejects.toThrow();
	});

	it("returns an empty list for a fresh authenticated user", async () => {
		const cookie = await createVerifiedUser(
			"passkey@example.com",
			"password123",
		);
		const list = await auth.api.listPasskeys({
			headers: new Headers({ cookie }),
		});
		expect(Array.isArray(list)).toBe(true);
		expect(list).toHaveLength(0);
	});

	// Registering + asserting a credential needs a browser-backed authenticator,
	// so full coverage lives in Playwright with a virtual authenticator.
	it.todo(
		"registers a passkey and signs in with it (Playwright — virtual authenticator)",
	);
});
