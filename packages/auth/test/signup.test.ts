import { testDbClient } from "@quickengine/db/testing";
import { describe, expect, it } from "vitest";
import { apiSignIn, apiSignUp } from "./helpers";

type Body = { user?: { email?: string }; token?: string | null };

describe("sign-up", () => {
	it("creates the user but issues NO session until email is verified", async () => {
		const { res, body, cookie } = await apiSignUp(
			"new@example.com",
			"password123",
		);

		expect(res.status).toBe(200);
		expect((body as Body).user?.email).toBe("new@example.com");
		// The security-critical assertion: unverified accounts get no session.
		expect((body as Body).token).toBeNull();
		expect(cookie).toBe("");
	});

	it("never creates a duplicate account for an existing email", async () => {
		// Better Auth answers 200 to a repeat sign-up (anti-enumeration), so the
		// real invariant to guard is that no second row is ever created.
		await apiSignUp("dupe@example.com", "password123");
		await apiSignUp("dupe@example.com", "password123");

		const rows = await testDbClient()`
			SELECT count(*)::int AS n FROM quickengine_users WHERE email = 'dupe@example.com'
		`;
		expect(rows[0].n).toBe(1);
	});

	it("rejects a too-short password (min length enforced)", async () => {
		const { res } = await apiSignUp("short@example.com", "short");

		expect(res.status).toBeGreaterThanOrEqual(400);
	});

	it("will not let an unverified account sign in", async () => {
		await apiSignUp("unverified@example.com", "password123");
		const { res, cookie } = await apiSignIn(
			"unverified@example.com",
			"password123",
		);

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(cookie).toBe("");
	});
});
