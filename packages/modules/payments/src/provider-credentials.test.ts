import { beforeEach, describe, expect, it } from "vitest";
import {
	decryptProviderCredentials,
	describeProviderCredentials,
	encryptProviderCredentials,
} from "./provider-credentials";

beforeEach(() => {
	process.env.BETTER_AUTH_SECRET = "a-test-application-secret-value";
});

describe("provider credentials at rest", () => {
	it("round-trips what a business supplied", () => {
		const stored = encryptProviderCredentials({
			clientId: "AaBbCc-client",
			clientSecret: "EEssSecret",
			webhookId: "WH-123",
		});

		expect(decryptProviderCredentials(stored)).toEqual({
			clientId: "AaBbCc-client",
			clientSecret: "EEssSecret",
			webhookId: "WH-123",
		});
	});

	it("stores nothing readable, so a database dump alone is not a credential", () => {
		const stored = encryptProviderCredentials({
			clientId: "AaBbCc-client",
			clientSecret: "EEssSecret",
		});

		expect(stored).not.toContain("EEssSecret");
		expect(stored).not.toContain("AaBbCc-client");
		expect(stored.startsWith("v1.")).toBe(true);
	});

	// 🔴 GCM authenticates the ciphertext. A row somebody edited must fail loudly
	// rather than decrypt to a wrong secret that would surface later as confusing
	// provider errors on a live checkout.
	it("refuses a tampered row instead of returning a wrong secret", () => {
		const stored = encryptProviderCredentials({
			clientId: "client",
			clientSecret: "secret",
		});
		const [version, iv, tag, ciphertext] = stored.split(".");
		const flipped = `${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === "aa" ? "bb" : "aa"}`;

		expect(() =>
			decryptProviderCredentials([version, iv, tag, flipped].join(".")),
		).toThrow();
		expect(() => decryptProviderCredentials("nonsense")).toThrow(
			"PROVIDER_CREDENTIALS_MALFORMED",
		);
	});

	/**
	 * 🔴 The secret must never be readable back, not even by the business that
	 * supplied it. Anything a page can display, a hijacked session can steal.
	 */
	it("never describes the secret back to anyone", () => {
		const stored = encryptProviderCredentials({
			clientId: "AaBbCc-client",
			clientSecret: "EEssSecret",
			webhookId: "WH-123",
		});

		const described = describeProviderCredentials(stored);
		expect(described).toEqual({
			present: true,
			clientId: "AaBbCc-client",
			webhookConfigured: true,
		});
		expect(JSON.stringify(described)).not.toContain("EEssSecret");
	});

	it("reports an undecryptable row as not connected rather than throwing", () => {
		// The real state after the application secret is rotated. The page must
		// say "connect again", not fall over.
		expect(describeProviderCredentials("v1.aa.bb.cc")).toEqual({
			present: false,
			clientId: null,
			webhookConfigured: false,
		});
	});
});
