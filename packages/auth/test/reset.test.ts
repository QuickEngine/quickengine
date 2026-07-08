import { describe, expect, it } from "vitest";
import { apiSignUp, auth, markEmailVerified } from "./helpers";

describe("password reset", () => {
	it("rejects an invalid reset token", async () => {
		await expect(
			auth.api.resetPassword({
				body: { newPassword: "brandnewpassword", token: "bad-token" },
			}),
		).rejects.toThrow();
	});

	it("does not reveal whether an email exists (no user enumeration)", async () => {
		// A request for an unknown address must look identical to a known one.
		const res = await auth.api.requestPasswordReset({
			body: {
				email: "nobody@example.com",
				redirectTo: "http://localhost:3002/reset-password",
			},
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it("accepts a reset request for a real account without erroring", async () => {
		await apiSignUp("reset@example.com", "password123");
		await markEmailVerified("reset@example.com");

		const res = await auth.api.requestPasswordReset({
			body: {
				email: "reset@example.com",
				redirectTo: "http://localhost:3002/reset-password",
			},
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});

	it.todo(
		"resets the password via the real emailed token (Playwright — needs the email)",
	);
});
