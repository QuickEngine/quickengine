import { describe, expect, it } from "vitest";
import {
	apiSignIn,
	apiSignOut,
	apiSignUp,
	auth,
	createVerifiedUser,
	markEmailVerified,
} from "./helpers";

describe("sign-in", () => {
	it("rejects a wrong password", async () => {
		await apiSignUp("real@example.com", "password123");
		await markEmailVerified("real@example.com");

		const { res, cookie } = await apiSignIn(
			"real@example.com",
			"wrongpassword",
		);

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(cookie).toBe("");
	});

	it("rejects an unknown email", async () => {
		const { res, cookie } = await apiSignIn("ghost@example.com", "password123");

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(cookie).toBe("");
	});

	it("issues a session for correct credentials once verified", async () => {
		const cookie = await createVerifiedUser("ok@example.com", "password123");
		expect(cookie).not.toBe("");

		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session?.user.email).toBe("ok@example.com");
	});

	it("invalidates the session on sign-out", async () => {
		const cookie = await createVerifiedUser("bye@example.com", "password123");

		await apiSignOut(cookie);

		// Force a DB check — the 5-min cookie cache would otherwise still trust
		// the pre-sign-out cookie a browser would have already discarded.
		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
			query: { disableCookieCache: true },
		});
		expect(session).toBeNull();
	});
});
