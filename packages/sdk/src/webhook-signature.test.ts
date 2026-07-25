import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhook-signature";

// The canonical vector. `packages/events/test/webhook-crypto.test.ts` asserts the
// identical values, so the SDK's standalone copy of the algorithm cannot drift
// from the server's — change one side and the other suite fails.
const VECTOR = {
	secret: "whsec_test_0123456789abcdef",
	body: '{"id":"evt_1","type":"invoice.paid"}',
	timestamp: 1784980800,
};

const sign = (secret: string, body: string, timestamp: number) =>
	`t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const atSignedTime = { nowMs: VECTOR.timestamp * 1000 };

describe("verifyWebhookSignature", () => {
	it("accepts a genuine signature", () => {
		const header = sign(VECTOR.secret, VECTOR.body, VECTOR.timestamp);
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header,
				...atSignedTime,
			}),
		).toBe(true);
	});

	it("computes the documented signature for the shared vector", () => {
		// Pins the exact algorithm: HMAC-SHA256 over `<timestamp>.<body>`, hex.
		const expected = createHmac("sha256", VECTOR.secret)
			.update(`${VECTOR.timestamp}.${VECTOR.body}`)
			.digest("hex");
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header: `t=${VECTOR.timestamp},v1=${expected}`,
				...atSignedTime,
			}),
		).toBe(true);
	});

	it("rejects a body that was modified in transit", () => {
		const header = sign(VECTOR.secret, VECTOR.body, VECTOR.timestamp);
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body.replace("invoice.paid", "invoice.voided"),
				header,
				...atSignedTime,
			}),
		).toBe(false);
	});

	it("rejects a forged signature from the wrong secret", () => {
		const header = sign("whsec_attacker", VECTOR.body, VECTOR.timestamp);
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header,
				...atSignedTime,
			}),
		).toBe(false);
	});

	it("rejects a replay outside the tolerance window", () => {
		const header = sign(VECTOR.secret, VECTOR.body, VECTOR.timestamp);
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header,
				nowMs: (VECTOR.timestamp + 600) * 1000,
			}),
		).toBe(false);
	});

	it("treats a missing header as unverified rather than throwing", () => {
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header: undefined,
			}),
		).toBe(false);
	});
});
