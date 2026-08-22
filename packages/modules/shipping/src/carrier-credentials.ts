import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";

/**
 * A carrier integration's credentials, encrypted at rest.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `DECISIONS.md` 2026-08-21: a merchant brings their OWN carrier account, the
 * same answer Stripe Connect gave. That is what makes negotiated carrier rates
 * carry over, which is the whole reason a real shop cares — and it means a
 * token belonging to the business has to live somewhere, as the business.
 *
 * 🔴 These cannot be hashed. Every rate lookup and label purchase needs the
 * plaintext, exactly as the supplier and payment credentials do. So the
 * protection is AES-256-GCM at rest under a key derived from the application
 * secret: a stolen database dump alone yields nothing usable.
 *
 * ⚠️ Its own key derivation, separate from payments, webhooks AND suppliers.
 * The salt and info string below MUST NOT be reused or edited — domain
 * separation is the point, so a ciphertext lifted out of
 * `shipping_carrier_connections` cannot be decrypted as though it were a
 * supplier credential, and one mistake stays inside one feature.
 *
 * ⚠️ Rotating `BETTER_AUTH_SECRET` makes every stored credential undecryptable
 * and every business must reconnect its carrier. That rotation already
 * invalidates sessions, payment credentials and supplier connections; it is now
 * also a shipping event.
 */

const KEY_INFO = "quickengine:carrier-credentials:v1";
const KEY_SALT = "quickengine-carriers";
const IV_BYTES = 12; // GCM standard nonce length.

let cachedKey: { source: string; key: Buffer } | undefined;

function encryptionKey(): Buffer {
	const appSecret = process.env.BETTER_AUTH_SECRET;
	if (!appSecret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required to handle carrier credentials",
		);
	}
	if (cachedKey?.source === appSecret) return cachedKey.key;
	const key = Buffer.from(
		hkdfSync("sha256", appSecret, KEY_SALT, KEY_INFO, 32),
	);
	cachedKey = { source: appSecret, key };
	return key;
}

/**
 * What a business gives us so we can price and buy its parcels.
 *
 * Deliberately smaller than the supplier equivalent: a carrier aggregator
 * authenticates with one bearer token and nothing else. There is no host to
 * store, because the API base belongs to the ADAPTER rather than to the
 * business — a merchant does not get to point us at a different Shippo.
 */
export type CarrierCredentials = {
	/** The carrier account's API token. Never leaves the server. */
	apiToken: string;
	/**
	 * What the carrier signs its tracking callbacks with.
	 *
	 * Optional because tracking webhooks are set up after the connection works,
	 * and refusing to store a token until a webhook exists would make the first
	 * step impossible.
	 */
	webhookSecret?: string;
};

/** Encrypts credentials for storage. Output: `v1.<iv>.<tag>.<ciphertext>`. */
export function encryptCarrierCredentials(
	credentials: CarrierCredentials,
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
export function decryptCarrierCredentials(stored: string): CarrierCredentials {
	const [version, iv, tag, ciphertext] = stored.split(".");
	if (version !== "v1" || !iv || !tag || !ciphertext) {
		throw new Error("CARRIER_CREDENTIALS_MALFORMED");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(iv, "base64url"),
	);
	// GCM authenticates the ciphertext: a modified row fails here rather than
	// yielding a wrong token that would surface as a confusing carrier error.
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return JSON.parse(
		Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8"),
	) as CarrierCredentials;
}

/**
 * What may be shown back to the operator.
 *
 * 🔴 The token NEVER leaves the server, not even to the business that supplied
 * it. A page able to display it turns every session hijack into a theft of
 * that business's carrier account, which can print labels billed to them. They
 * already have the value — it came from their own carrier dashboard. Replacing
 * it is supported; reading it back is not.
 *
 * ⚠️ Returns `present: false` for an undecryptable blob rather than throwing.
 * After a secret rotation every stored credential is unreadable, and a settings
 * page that crashes is worse than one that says "not connected" beside a button
 * to reconnect.
 */
export function describeCarrierCredentials(stored: string | null): {
	present: boolean;
	webhookConfigured: boolean;
} {
	if (!stored) return { present: false, webhookConfigured: false };
	try {
		const credentials = decryptCarrierCredentials(stored);
		return {
			present: credentials.apiToken.length > 0,
			webhookConfigured: Boolean(credentials.webhookSecret),
		};
	} catch {
		return { present: false, webhookConfigured: false };
	}
}
