import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

/**
 * Signing-secret storage and request signing for outbound webhooks.
 *
 * A webhook secret is unlike an API key: we must recover the value to sign every
 * request, so it cannot be hashed. It is encrypted at rest with AES-256-GCM
 * instead, so a stolen database dump alone does not let an attacker forge events
 * into a customer's systems — they would need the application secret too.
 *
 * The encryption key is derived from `BETTER_AUTH_SECRET` via HKDF rather than
 * being its own environment variable, so there is no new secret to provision or
 * to drift between environments.
 *
 * ⚠️ Rotating `BETTER_AUTH_SECRET` makes every stored webhook secret
 * undecryptable and every endpoint must be re-issued. That rotation already
 * invalidates all sessions, so it is not a routine operation — but it is now
 * also a webhook event.
 */

const KEY_INFO = "quickengine:webhook-secret:v1";
const IV_BYTES = 12; // GCM standard nonce length.

// Derivation is deterministic, so it is done once per application secret rather
// than per call — signing a delivery batch must not pay for it repeatedly. Keyed
// by the source secret so a test (or a rotation) that changes it re-derives.
let cachedKey: { source: string; key: Buffer } | undefined;

function encryptionKey(): Buffer {
	const appSecret = process.env.BETTER_AUTH_SECRET;
	if (!appSecret) {
		throw new Error("BETTER_AUTH_SECRET is required to handle webhook secrets");
	}
	if (cachedKey?.source === appSecret) return cachedKey.key;

	// A fixed salt is acceptable here: the input is already a high-entropy secret,
	// and the purpose of the derivation is domain separation, not password
	// stretching.
	const key = Buffer.from(
		hkdfSync("sha256", appSecret, "quickengine-webhooks", KEY_INFO, 32),
	);
	cachedKey = { source: appSecret, key };
	return key;
}

/** A fresh signing secret, shown to the customer once at creation. */
export function generateWebhookSecret(): string {
	return `whsec_${randomBytes(32).toString("base64url")}`;
}

/** Encrypts a signing secret for storage. Output: `v1.<iv>.<tag>.<ciphertext>`. */
export function encryptWebhookSecret(plaintext: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [
		"v1",
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

/** Recovers a stored signing secret. Throws if the ciphertext was tampered with. */
export function decryptWebhookSecret(stored: string): string {
	const [version, iv, tag, ciphertext] = stored.split(".");
	if (version !== "v1" || !iv || !tag || !ciphertext) {
		throw new Error("WEBHOOK_SECRET_MALFORMED");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(iv, "base64url"),
	);
	// GCM authenticates the ciphertext: a modified row fails here rather than
	// silently yielding a wrong key that would sign unverifiable requests.
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

export type WebhookSignature = {
	/** Value for the `QuickEngine-Signature` header. */
	header: string;
	timestamp: number;
};

/**
 * Signs a payload the way Stripe and GitHub do: HMAC-SHA256 over
 * `<timestamp>.<body>`, with the timestamp carried in the header.
 *
 * Binding the timestamp into the signed string is what makes it useful — a
 * receiver can reject anything older than their tolerance, so a captured request
 * cannot be replayed later, and an attacker cannot simply rewrite the timestamp
 * because doing so invalidates the signature.
 */
export function signWebhookPayload(
	secret: string,
	body: string,
	atMs: number = Date.now(),
): WebhookSignature {
	const timestamp = Math.floor(atMs / 1000);
	const signature = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	return { header: `t=${timestamp},v1=${signature}`, timestamp };
}

/**
 * Verifies a signature header. Provided so QuickEngine's own tests — and the
 * SDK we hand to customers — check signatures the same way.
 *
 * `toleranceSeconds` bounds how old a request may be; pass 0 to skip the check.
 */
export function verifyWebhookSignature(options: {
	secret: string;
	body: string;
	header: string;
	toleranceSeconds?: number;
	nowMs?: number;
}): boolean {
	const { secret, body, header, toleranceSeconds = 300 } = options;
	const nowMs = options.nowMs ?? Date.now();

	const parts = new Map(
		header.split(",").map((part) => {
			const [key, ...rest] = part.trim().split("=");
			return [key, rest.join("=")] as const;
		}),
	);
	const timestamp = Number(parts.get("t"));
	const provided = parts.get("v1");
	if (!Number.isFinite(timestamp) || !provided) return false;

	if (toleranceSeconds > 0) {
		const ageSeconds = Math.abs(nowMs / 1000 - timestamp);
		if (ageSeconds > toleranceSeconds) return false;
	}

	const expected = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	const expectedBytes = Buffer.from(expected, "utf8");
	const providedBytes = Buffer.from(provided, "utf8");
	// Length must match before timingSafeEqual, and comparing this way keeps the
	// check constant-time so it can't be probed byte by byte.
	if (expectedBytes.length !== providedBytes.length) return false;
	return timingSafeEqual(expectedBytes, providedBytes);
}
