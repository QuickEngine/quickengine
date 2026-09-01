import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * A shareable link that onboards one supplier to Stripe.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Stripe account links expire in minutes and die on first use. That is correct —
 * the URL is a bearer credential to somebody's bank details — but it makes the
 * link impossible to send by email to a partner who reads it three hours later.
 * Stripe's own answer is `refresh_url`: a URL of ours that mints a fresh link.
 * Ours pointed at an authenticated QuickDash page, so the supplier was bounced
 * to a login they do not have.
 *
 * This token addresses one supplier, in one environment, and is exchanged for a
 * fresh Stripe link at the moment it is opened. Send it once; it keeps working.
 *
 * ── Why the environment is INSIDE the token ──────────────────────────────────
 *
 * 🔴 `connectSupplierPaymentAccount` reads the environment from the workspace at
 * click time. A link minted while a workspace was in test would silently onboard
 * a supplier into LIVE if the workspace flipped before they opened it — a real
 * bank account attached to a rehearsal, or a test account expected to receive
 * real money. Pinning it at mint time makes that impossible: the route compares
 * this value against the workspace and refuses a mismatch rather than guessing.
 *
 * Test and live are separate Stripe accounts, so going live means issuing a new
 * link and onboarding again. `supplier_payment_accounts` is already keyed on
 * `(supplierId, provider, environment)` for exactly that reason.
 *
 * ── Why there is no table ────────────────────────────────────────────────────
 *
 * The token carries its own claims and is verified by recomputing the signature,
 * so nothing is stored and there is no migration. The cost is that an individual
 * link cannot be revoked before it expires — acceptable because it grants only
 * "begin onboarding for this supplier", never access to data, and because
 * rotating `BETTER_AUTH_SECRET` invalidates every link at once.
 */

export type SupplierLinkEnvironment = "test" | "live";

export interface SupplierOnboardingClaims {
	workspaceId: string;
	supplierId: string;
	environment: SupplierLinkEnvironment;
	/** Seconds since the epoch. */
	expiresAt: number;
}

const KEY_INFO = "quickengine:supplier-onboarding-link:v1";
const VERSION = "v1";

/** 30 days. Long enough to survive a slow partner, short enough to age out. */
export const DEFAULT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

let cachedKey: { source: string; key: Buffer } | undefined;

function signingKey(): Buffer {
	const appSecret = process.env.BETTER_AUTH_SECRET;
	if (!appSecret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required to issue supplier onboarding links",
		);
	}
	if (cachedKey?.source === appSecret) return cachedKey.key;

	// Same reasoning as the webhook secret: a fixed salt is fine because the
	// input is already high-entropy and the derivation exists for domain
	// separation. A distinct `info` keeps this key unrelated to that one, so a
	// flaw in either cannot be used against the other.
	const key = Buffer.from(
		hkdfSync("sha256", appSecret, "quickengine-supplier-links", KEY_INFO, 32),
	);
	cachedKey = { source: appSecret, key };
	return key;
}

function sign(payload: string): string {
	return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/**
 * ⚠️ Compare in constant time, and only after a length check.
 * `timingSafeEqual` throws on a length mismatch rather than returning false,
 * which would turn a malformed token into a 500 instead of a refusal.
 */
function signaturesMatch(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}

function encodeClaims(claims: SupplierOnboardingClaims): string {
	// Positional, not JSON: the payload is signed, so it must serialise
	// identically every time. Key order in JSON is not guaranteed across
	// runtimes, and a reordered payload would fail its own signature.
	return [
		VERSION,
		claims.workspaceId,
		claims.supplierId,
		claims.environment,
		String(claims.expiresAt),
	].join(".");
}

/** Mint a token. The raw string is the only thing the supplier ever needs. */
export function createSupplierOnboardingToken(input: {
	workspaceId: string;
	supplierId: string;
	environment: SupplierLinkEnvironment;
	ttlSeconds?: number;
	now?: Date;
}): { token: string; expiresAt: Date } {
	const issuedAt = input.now ?? new Date();
	const ttl = input.ttlSeconds ?? DEFAULT_LINK_TTL_SECONDS;
	const expiresAt = Math.floor(issuedAt.getTime() / 1000) + ttl;
	const payload = encodeClaims({
		workspaceId: input.workspaceId,
		supplierId: input.supplierId,
		environment: input.environment,
		expiresAt,
	});
	return {
		token: `${payload}.${sign(payload)}`,
		expiresAt: new Date(expiresAt * 1000),
	};
}

export type SupplierTokenFailure =
	| "malformed"
	| "bad-signature"
	| "expired"
	| "unsupported-version";

export type SupplierTokenResult =
	| { ok: true; claims: SupplierOnboardingClaims }
	| { ok: false; reason: SupplierTokenFailure };

/**
 * Verify a presented token.
 *
 * Returns a reason rather than throwing so the route can answer a person in
 * plain language — "this link has expired, ask for a new one" reads very
 * differently from "something went wrong".
 */
export function readSupplierOnboardingToken(
	token: string,
	now: Date = new Date(),
): SupplierTokenResult {
	const parts = token.split(".");
	if (parts.length !== 6) return { ok: false, reason: "malformed" };

	const [version, workspaceId, supplierId, environment, expiry, signature] =
		parts;
	if (version !== VERSION) return { ok: false, reason: "unsupported-version" };
	if (environment !== "test" && environment !== "live") {
		return { ok: false, reason: "malformed" };
	}
	const expiresAt = Number(expiry);
	if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
		return { ok: false, reason: "malformed" };
	}

	// 🔴 Signature BEFORE expiry. Reading a claim out of an unverified token and
	// acting on it — even to reject it — treats attacker-supplied data as fact.
	const payload = [version, workspaceId, supplierId, environment, expiry].join(
		".",
	);
	if (!signaturesMatch(signature, sign(payload))) {
		return { ok: false, reason: "bad-signature" };
	}

	if (Math.floor(now.getTime() / 1000) >= expiresAt) {
		return { ok: false, reason: "expired" };
	}

	return {
		ok: true,
		claims: { workspaceId, supplierId, environment, expiresAt },
	};
}
