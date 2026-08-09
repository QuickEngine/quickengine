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

	/**
	 * The actual enumeration test, and the one the two above cannot make.
	 *
	 * Each of them proves its case is *rejected*. Neither proves the two are
	 * rejected **the same way** — and that difference is the entire leak. If a
	 * wrong password answers "incorrect password" while an unknown address answers
	 * "no such user", both tests still pass while the endpoint cheerfully confirms
	 * which email addresses have accounts. That is how attackers build target lists
	 * before they try a single credential.
	 */
	it("answers a wrong password and an unknown email identically", async () => {
		await apiSignUp("known@example.com", "password123");
		await markEmailVerified("known@example.com");

		const wrongPassword = await apiSignIn("known@example.com", "wrongpassword");
		const unknownEmail = await apiSignIn("nobody@example.com", "wrongpassword");

		expect(wrongPassword.res.status).toBe(unknownEmail.res.status);

		const [a, b] = await Promise.all([
			wrongPassword.res.clone().text(),
			unknownEmail.res.clone().text(),
		]);
		// Compared as raw bodies: a differing error code or message is exactly the
		// signal being guarded against, even when the status matches.
		expect(a).toBe(b);
		expect(wrongPassword.cookie).toBe("");
		expect(unknownEmail.cookie).toBe("");
	});

	it("issues a session for correct credentials once verified", async () => {
		await apiSignUp("ok@example.com", "password123");
		await markEmailVerified("ok@example.com");
		const signedIn = await apiSignIn("ok@example.com", "password123");
		const { cookie } = signedIn;
		expect(cookie).not.toBe("");
		const sessionCookie = signedIn.res.headers
			.getSetCookie()
			.find((value) => value.includes("session_token"));
		expect(sessionCookie).toContain("HttpOnly");
		expect(sessionCookie).toContain("SameSite=Lax");

		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session?.user.email).toBe("ok@example.com");
	});

	it("invalidates the session on sign-out", async () => {
		const cookie = await createVerifiedUser("bye@example.com", "password123");

		await apiSignOut(cookie);

		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session).toBeNull();
	});

	it("preserves password sign-in after signing out", async () => {
		const email = "returning@example.com";
		const password = "password123";
		const firstCookie = await createVerifiedUser(email, password);

		await apiSignOut(firstCookie);
		const secondSignIn = await apiSignIn(email, password);

		expect(secondSignIn.res.status).toBe(200);
		expect(secondSignIn.cookie).not.toBe("");
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: secondSignIn.cookie }),
			query: { disableCookieCache: true },
		});
		expect(session?.user.email).toBe(email);
	});
});
