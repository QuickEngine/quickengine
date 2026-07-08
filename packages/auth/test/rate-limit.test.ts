import { describe, expect, it } from "vitest";
import { auth } from "./helpers";

// Rate limiting is applied in the HTTP handler pipeline (not on direct auth.api
// calls), and it keys on client IP. So we drive auth.handler with a fixed
// spoofed IP and hammer sign-in until the limiter trips.
describe("rate limiting", () => {
	it("returns 429 when sign-in is hammered from one IP", async () => {
		let saw429 = false;

		for (let attempt = 0; attempt < 150; attempt++) {
			const request = new Request(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-forwarded-for": "203.0.113.7",
					},
					body: JSON.stringify({
						email: "flood@example.com",
						password: "password123",
					}),
				},
			);

			const res = await auth.handler(request);
			if (res.status === 429) {
				saw429 = true;
				break;
			}
		}

		expect(saw429).toBe(true);
	}, 30_000);
});
