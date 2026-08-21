import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";

/**
 * A supplier integration's credentials, encrypted at rest.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `suppliers.ts` deliberately holds no credential column, on the grounds that a
 * secret should arrive with the adapter that needs it. This is that arrival: an
 * automated handoff — Shopify today, a supplier's own API later — has to
 * authenticate, and it has to do so as the BUSINESS, never as QuickEngine.
 *
 * 🔴 These cannot be hashed. Every outbound call needs the plaintext, exactly as
 * PayPal's do. So the protection is AES-256-GCM at rest under a key derived from
 * the application secret: a stolen database dump alone yields nothing usable.
 *
 * ⚠️ Its own key derivation, separate from payments and from webhook secrets.
 * The salt and info string below MUST NOT be reused or edited — domain
 * separation is the point, so that a ciphertext lifted out of
 * `supplier_connections` cannot be decrypted as though it were a payment
 * credential, and one mistake stays inside one feature.
 *
 * ⚠️ Rotating `BETTER_AUTH_SECRET` makes every stored credential undecryptable
 * and every business must reconnect its suppliers. That rotation already
 * invalidates sessions and payment credentials; it is now also a fulfilment
 * event.
 */

const KEY_INFO = "quickengine:supplier-credentials:v1";
const KEY_SALT = "quickengine-suppliers";
const IV_BYTES = 12; // GCM standard nonce length.

let cachedKey: { source: string; key: Buffer } | undefined;

function encryptionKey(): Buffer {
	const appSecret = process.env.BETTER_AUTH_SECRET;
	if (!appSecret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required to handle supplier credentials",
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
 * What a business gives us so we can place its orders with a supplier.
 *
 * Shaped for a token-and-host provider rather than the OAuth client pair
 * payments uses, because that is what an Admin API custom app actually issues.
 *
 * `webhookSecret` is what the PROVIDER signs its callbacks with, and it differs
 * per connected account — which is why inbound verification must resolve the
 * connection before it can check a signature, and why the workspace and supplier
 * are in the webhook path rather than in its body.
 */
export type SupplierCredentials = {
	/** The Admin API access token. Never leaves the server. */
	adminAccessToken: string;
	/** Shared secret used to verify that supplier's inbound webhooks. */
	webhookSecret?: string;
	/** The account the token belongs to — a shop domain, an API base. */
	shopDomain: string;
	/** Pinned deliberately: a provider that moves its API forward must not move ours. */
	apiVersion: string;
};

/** Encrypts credentials for storage. Output: `v1.<iv>.<tag>.<ciphertext>`. */
export function encryptSupplierCredentials(
	credentials: SupplierCredentials,
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
export function decryptSupplierCredentials(
	stored: string,
): SupplierCredentials {
	const [version, iv, tag, ciphertext] = stored.split(".");
	if (version !== "v1" || !iv || !tag || !ciphertext) {
		throw new Error("SUPPLIER_CREDENTIALS_MALFORMED");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(iv, "base64url"),
	);
	// GCM authenticates the ciphertext: a modified row fails here rather than
	// yielding a wrong token that would surface as a confusing provider error.
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return JSON.parse(
		Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8"),
	) as SupplierCredentials;
}

/**
 * What may be shown back to the operator.
 *
 * 🔴 The token NEVER leaves the server, not even to the business that supplied
 * it. A page able to display it turns every session hijack into a theft of
 * write access to that business's Shopify store. They already have the value —
 * it came from their own admin. Replacing it is supported; reading it back is
 * not.
 */
export function describeSupplierCredentials(stored: string | null): {
	present: boolean;
	shopDomain: string | null;
	apiVersion: string | null;
	webhookConfigured: boolean;
} {
	if (!stored) {
		return {
			present: false,
			shopDomain: null,
			apiVersion: null,
			webhookConfigured: false,
		};
	}
	try {
		const credentials = decryptSupplierCredentials(stored);
		return {
			// Neither of these is a secret — the shop domain is public and the API
			// version is a date. Showing them is how somebody confirms they
			// connected the right store.
			shopDomain: credentials.shopDomain,
			apiVersion: credentials.apiVersion,
			present: true,
			webhookConfigured: Boolean(credentials.webhookSecret),
		};
	} catch {
		// An undecryptable row is a real state after secret rotation. Reported as
		// "connect again" rather than crashing the page.
		return {
			present: false,
			shopDomain: null,
			apiVersion: null,
			webhookConfigured: false,
		};
	}
}
