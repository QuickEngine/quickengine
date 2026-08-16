import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";

/**
 * A business's OWN payment-provider credentials, encrypted at rest.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Stripe never needs it: Connect issues an account id and the platform key does
 * the work, so QuickEngine holds no Stripe secret belonging to a customer.
 * PayPal reserves that hosted flow for approved partners, and QuickEngine
 * deliberately is not one — it takes no cut of what a business earns, so
 * standing between a business and PayPal buys nothing and costs an approval
 * queue. The business supplies its own app credentials instead, and QuickEngine
 * acts strictly on its behalf.
 *
 * 🔴 These cannot be hashed. Every outbound PayPal call needs the plaintext, the
 * way an outbound webhook needs its signing secret. So the protection is
 * AES-256-GCM at rest with a key derived from the application secret: a stolen
 * database dump alone does not yield a usable credential.
 *
 * ⚠️ Deliberately its own key derivation, separate from webhook secrets. Domain
 * separation means a ciphertext lifted from one table cannot be decrypted as if
 * it belonged to the other, and it keeps the blast radius of any single mistake
 * inside one feature.
 *
 * ⚠️ Rotating `BETTER_AUTH_SECRET` makes every stored credential undecryptable
 * and every business must re-enter theirs. That rotation already invalidates all
 * sessions, so it is not routine — but it is now also a payments event.
 */

const KEY_INFO = "quickengine:provider-credentials:v1";
const IV_BYTES = 12; // GCM standard nonce length.

let cachedKey: { source: string; key: Buffer } | undefined;

function encryptionKey(): Buffer {
	const appSecret = process.env.BETTER_AUTH_SECRET;
	if (!appSecret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required to handle provider credentials",
		);
	}
	if (cachedKey?.source === appSecret) return cachedKey.key;
	const key = Buffer.from(
		hkdfSync("sha256", appSecret, "quickengine-payments", KEY_INFO, 32),
	);
	cachedKey = { source: appSecret, key };
	return key;
}

/**
 * What a business gives us so we can act for them.
 *
 * `webhookId` is PayPal's identifier for the webhook THEY registered against
 * THEIR app. Verification needs it, and it differs per business — which is why
 * a single platform-wide webhook id cannot work under this model.
 */
export type ProviderCredentials = {
	clientId: string;
	clientSecret: string;
	webhookId?: string;
};

/** Encrypts credentials for storage. Output: `v1.<iv>.<tag>.<ciphertext>`. */
export function encryptProviderCredentials(
	credentials: ProviderCredentials,
): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(credentials), "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

/** Recovers stored credentials. Throws if the row was tampered with. */
export function decryptProviderCredentials(
	stored: string,
): ProviderCredentials {
	const [version, iv, tag, ciphertext] = stored.split(".");
	if (version !== "v1" || !iv || !tag || !ciphertext) {
		throw new Error("PROVIDER_CREDENTIALS_MALFORMED");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(iv, "base64url"),
	);
	// GCM authenticates the ciphertext: a modified row fails here rather than
	// yielding a wrong secret that would produce confusing provider errors.
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return JSON.parse(
		Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8"),
	) as ProviderCredentials;
}

/**
 * What may be shown back to the operator.
 *
 * 🔴 The secret NEVER leaves the server, not even to the business that supplied
 * it. A page that could display it would turn every session hijack into a
 * payment-credential theft, and the business already has these values — they
 * came from PayPal's own dashboard. Replacing them is the supported operation;
 * reading them back is not.
 */
export function describeProviderCredentials(stored: string | null): {
	present: boolean;
	clientId: string | null;
	webhookConfigured: boolean;
} {
	if (!stored)
		return { present: false, clientId: null, webhookConfigured: false };
	try {
		const credentials = decryptProviderCredentials(stored);
		return {
			// The client id is not a secret — it identifies the app publicly — and
			// showing it is how somebody confirms they connected the right one.
			clientId: credentials.clientId,
			present: true,
			webhookConfigured: Boolean(credentials.webhookId),
		};
	} catch {
		// An undecryptable row is a real state after secret rotation. Reported as
		// "connect again" rather than crashing the page.
		return { present: false, clientId: null, webhookConfigured: false };
	}
}
