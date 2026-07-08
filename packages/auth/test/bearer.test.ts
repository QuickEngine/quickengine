import { describe, expect, it } from "vitest";
import { auth, createVerifiedUser } from "./helpers";

describe("bearer tokens (native clients)", () => {
	it("issues a set-auth-token and authenticates get-session without cookies", async () => {
		await createVerifiedUser("bearer@example.com", "password123");

		const signIn = await auth.api.signInEmail({
			body: { email: "bearer@example.com", password: "password123" },
			asResponse: true,
		});
		const token = signIn.headers.get("set-auth-token");
		expect(token).toBeTruthy();

		// No cookie — only the Bearer header. This is the native path.
		const session = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${token}` }),
		});
		expect(session?.user.email).toBe("bearer@example.com");
	});

	it("rejects a garbage bearer token", async () => {
		const session = await auth.api.getSession({
			headers: new Headers({ authorization: "Bearer not-a-real-token" }),
		});
		expect(session).toBeNull();
	});
});
