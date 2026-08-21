import { beforeAll, describe, expect, it } from "vitest";
import {
	decryptSupplierCredentials,
	describeSupplierCredentials,
	encryptSupplierCredentials,
	type SupplierCredentials,
} from "./supplier-credentials";

const CREDENTIALS: SupplierCredentials = {
	adminAccessToken: "shpat_not_a_real_token",
	webhookSecret: "whsec_not_a_real_secret",
	shopDomain: "example.myshopify.com",
	apiVersion: "2026-07",
};

beforeAll(() => {
	process.env.BETTER_AUTH_SECRET ??= "test-secret-for-supplier-credentials";
});

describe("supplier credentials", () => {
	it("round-trips through encryption", () => {
		const stored = encryptSupplierCredentials(CREDENTIALS);
		expect(stored.startsWith("v1.")).toBe(true);
		// The token must not be sitting in the stored string in any readable form.
		expect(stored).not.toContain(CREDENTIALS.adminAccessToken);
		expect(decryptSupplierCredentials(stored)).toEqual(CREDENTIALS);
	});

	it("produces a different ciphertext every time", () => {
		// A fresh nonce per encryption. Identical output would leak that two
		// suppliers share a token.
		expect(encryptSupplierCredentials(CREDENTIALS)).not.toEqual(
			encryptSupplierCredentials(CREDENTIALS),
		);
	});

	it("refuses a tampered row rather than yielding a wrong token", () => {
		const [version, iv, tag, ciphertext] =
			encryptSupplierCredentials(CREDENTIALS).split(".");
		const flipped = `${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === "AA" ? "AB" : "AA"}`;
		expect(() =>
			decryptSupplierCredentials([version, iv, tag, flipped].join(".")),
		).toThrow();
	});

	it("refuses a malformed row", () => {
		expect(() => decryptSupplierCredentials("nonsense")).toThrow(
			"SUPPLIER_CREDENTIALS_MALFORMED",
		);
	});

	/**
	 * 🔴 The property that matters most. A page that could show the token would
	 * turn a session hijack into write access to the business's own store.
	 */
	it("never reveals the token or the webhook secret when described", () => {
		const described = describeSupplierCredentials(
			encryptSupplierCredentials(CREDENTIALS),
		);
		expect(described).toEqual({
			present: true,
			shopDomain: "example.myshopify.com",
			apiVersion: "2026-07",
			webhookConfigured: true,
		});
		expect(JSON.stringify(described)).not.toContain(
			CREDENTIALS.adminAccessToken,
		);
		expect(JSON.stringify(described)).not.toContain(CREDENTIALS.webhookSecret);
	});

	it("reports an undecryptable row as absent rather than crashing", () => {
		// The real state after a BETTER_AUTH_SECRET rotation: reconnect, not a 500.
		expect(describeSupplierCredentials("v1.aa.bb.cc")).toEqual({
			present: false,
			shopDomain: null,
			apiVersion: null,
			webhookConfigured: false,
		});
		expect(describeSupplierCredentials(null).present).toBe(false);
	});

	/**
	 * ⚠️ Domain separation, pinned deliberately.
	 *
	 * These two literals are the only thing stopping a ciphertext lifted from
	 * `supplier_connections` from decrypting as a payment credential. A future
	 * refactor that extracts a shared secret box must keep both byte for byte, so
	 * this asserts them rather than trusting a comment.
	 */
	it("derives its key from its own salt and info string", async () => {
		const source = await import("node:fs/promises").then((fs) =>
			fs.readFile(
				new URL("./supplier-credentials.ts", import.meta.url),
				"utf8",
			),
		);
		expect(source).toContain('"quickengine-suppliers"');
		expect(source).toContain('"quickengine:supplier-credentials:v1"');
		expect(source).not.toContain("quickengine-payments");
	});
});
