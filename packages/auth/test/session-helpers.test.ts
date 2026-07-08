import { describe, expect, it } from "vitest";
import { getSession, requireSession } from "../src/server";
import { createVerifiedUser } from "./helpers";

describe("getSession / requireSession helpers", () => {
	it("getSession returns null with no auth headers", async () => {
		const session = await getSession(new Headers());
		expect(session).toBeNull();
	});

	it("requireSession throws UNAUTHENTICATED with no session", async () => {
		await expect(requireSession(new Headers())).rejects.toThrow(
			"UNAUTHENTICATED",
		);
	});

	it("both resolve the user for a valid session", async () => {
		const cookie = await createVerifiedUser(
			"helper@example.com",
			"password123",
		);
		const headers = new Headers({ cookie });

		const session = await getSession(headers);
		expect(session?.user.email).toBe("helper@example.com");

		const required = await requireSession(headers);
		expect(required.user.email).toBe("helper@example.com");
	});
});
