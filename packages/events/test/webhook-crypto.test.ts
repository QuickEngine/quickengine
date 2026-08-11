import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	decryptWebhookSecret,
	encryptWebhookSecret,
	generateWebhookSecret,
	signWebhookPayload,
	verifyWebhookSignature,
} from "../src";

const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

describe("webhook secret storage", () => {
	it("round-trips a secret through encryption", () => {
		const secret = generateWebhookSecret();
		expect(secret.startsWith("whsec_")).toBe(true);

		const stored = encryptWebhookSecret(secret);
		// The plaintext must not be recoverable by reading the column.
		expect(stored).not.toContain(secret);
		expect(decryptWebhookSecret(stored)).toBe(secret);
	});

	it("produces different ciphertext each time for the same secret", () => {
		const secret = generateWebhookSecret();
		// A fresh nonce per encryption: identical secrets must not be identifiable
		// as identical by comparing stored rows.
		expect(encryptWebhookSecret(secret)).not.toBe(encryptWebhookSecret(secret));
	});

	it("refuses tampered ciphertext instead of returning a wrong key", () => {
		const stored = encryptWebhookSecret(generateWebhookSecret());
		const [version, iv, tag, ciphertext] = stored.split(".");
		const index = Math.floor(ciphertext.length / 2);
		const replacement = ciphertext[index] === "A" ? "B" : "A";
		const flipped = `${ciphertext.slice(0, index)}${replacement}${ciphertext.slice(index + 1)}`;

		expect(() =>
			decryptWebhookSecret([version, iv, tag, flipped].join(".")),
		).toThrow();
	});

	it("rejects a malformed stored value", () => {
		expect(() => decryptWebhookSecret("not-a-ciphertext")).toThrow(
			"WEBHOOK_SECRET_MALFORMED",
		);
	});
});

describe("webhook signing", () => {
	it("verifies a signature it just produced", () => {
		const secret = generateWebhookSecret();
		const { header } = signWebhookPayload(secret, body);

		expect(verifyWebhookSignature({ secret, body, header })).toBe(true);
	});

	it("rejects a payload that changed after signing", () => {
		const secret = generateWebhookSecret();
		const { header } = signWebhookPayload(secret, body);

		expect(
			verifyWebhookSignature({
				secret,
				body: body.replace("invoice.paid", "invoice.voided"),
				header,
			}),
		).toBe(false);
	});

	it("rejects a signature made with a different secret", () => {
		const { header } = signWebhookPayload(generateWebhookSecret(), body);

		expect(
			verifyWebhookSignature({ secret: generateWebhookSecret(), body, header }),
		).toBe(false);
	});

	it("rejects a captured request replayed outside the tolerance window", () => {
		const secret = generateWebhookSecret();
		const signedAt = Date.UTC(2026, 6, 25, 12, 0, 0);
		const { header } = signWebhookPayload(secret, body, signedAt);

		// Inside the window it verifies…
		expect(
			verifyWebhookSignature({
				secret,
				body,
				header,
				nowMs: signedAt + 60_000,
			}),
		).toBe(true);
		// …ten minutes later it does not.
		expect(
			verifyWebhookSignature({
				secret,
				body,
				header,
				nowMs: signedAt + 600_000,
			}),
		).toBe(false);
	});

	it("cannot be replayed by rewriting the timestamp, because it is signed", () => {
		const secret = generateWebhookSecret();
		const signedAt = Date.UTC(2026, 6, 25, 12, 0, 0);
		const { header } = signWebhookPayload(secret, body, signedAt);
		const forged = header.replace(
			/t=\d+/,
			`t=${Math.floor(Date.now() / 1000)}`,
		);

		expect(verifyWebhookSignature({ secret, body, header: forged })).toBe(
			false,
		);
	});

	it("rejects a header missing its parts", () => {
		const secret = generateWebhookSecret();

		expect(verifyWebhookSignature({ secret, body, header: "" })).toBe(false);
		expect(verifyWebhookSignature({ secret, body, header: "t=123" })).toBe(
			false,
		);
		expect(verifyWebhookSignature({ secret, body, header: "v1=abc" })).toBe(
			false,
		);
	});
});

// The SDK ships its own copy of the verification algorithm so customers don't
// pull server dependencies. This asserts the identical vector that
// `packages/sdk/src/webhook-signature.test.ts` asserts — if either side's
// algorithm changes, one of the two suites fails.
describe("cross-implementation vector", () => {
	const VECTOR = {
		secret: "whsec_test_0123456789abcdef",
		body: '{"id":"evt_1","type":"invoice.paid"}',
		timestamp: 1784980800,
	};

	it("signs the shared vector the way the SDK verifies it", () => {
		const { header } = signWebhookPayload(
			VECTOR.secret,
			VECTOR.body,
			VECTOR.timestamp * 1000,
		);
		expect(header).toBe(
			`t=${VECTOR.timestamp},v1=${createHmac("sha256", VECTOR.secret)
				.update(`${VECTOR.timestamp}.${VECTOR.body}`)
				.digest("hex")}`,
		);
		expect(
			verifyWebhookSignature({
				secret: VECTOR.secret,
				body: VECTOR.body,
				header,
				nowMs: VECTOR.timestamp * 1000,
			}),
		).toBe(true);
	});
});
