import { and, db, eq, isNull, quickengineApiKeys, sql } from "@quickengine/db";

/**
 * Which browser origins may call the API, beyond our own surfaces.
 *
 * 🔴 A storefront belongs to a customer's own domain — gemsutopia.com, not
 * quickdash.xyz — so the API's static `corsOrigins` allowlist cannot cover them.
 * Redeploying the API every time somebody connects a website is not a product.
 *
 * Origins are declared on the KEY (`quickengine_api_keys.allowed_origins`) and
 * resolved here.
 *
 * ⚠️ Cached, because this is consulted on every CORS preflight. A database
 * round-trip per OPTIONS request would put a query in front of every single
 * cross-origin call a storefront makes, including the ones that turn out to be
 * rejected.
 */

/**
 * How long a decision is trusted.
 *
 * Short on purpose. This is the window in which a revoked key's origin still
 * passes preflight — which is survivable, because CORS is not authorization:
 * the request still has to present a valid key and gets rejected on its merits.
 * Losing that distinction is how people end up treating CORS as a security
 * boundary.
 */
const TTL_MS = 60_000;

type Entry = { allowed: boolean; expiresAt: number };
const cache = new Map<string, Entry>();

/** Exposed for tests, and for the moment a key's origins are edited. */
export function forgetOriginCache(origin?: string) {
	if (origin) cache.delete(normalizeOrigin(origin));
	else cache.clear();
}

/**
 * Reduce a URL to scheme + host + port.
 *
 * Browsers send exactly this in `Origin`, but callers configuring a key will
 * paste a full URL with a path or a trailing slash. Normalising both sides is
 * what makes an exact comparison usable rather than a source of support tickets.
 */
export function normalizeOrigin(value: string): string {
	try {
		const url = new URL(value.trim());
		return url.origin.toLowerCase();
	} catch {
		return value.trim().toLowerCase().replace(/\/+$/, "");
	}
}

/**
 * Is this origin registered on any live key?
 *
 * 🔴 Matched against the stored list by EXACT origin. Never a prefix or suffix
 * test: `endsWith(".gemsutopia.com")` would accept
 * `https://evil-gemsutopia.com`, and `startsWith("https://gemsutopia.com")`
 * would accept `https://gemsutopia.com.evil.com`.
 *
 * Revoked and expired keys are excluded, so removing a key eventually removes
 * its origins without a separate cleanup step.
 */
export async function isRegisteredStorefrontOrigin(
	origin: string,
): Promise<boolean> {
	const normalized = normalizeOrigin(origin);
	if (!normalized || normalized === "null") return false;

	const cached = cache.get(normalized);
	if (cached && cached.expiresAt > Date.now()) return cached.allowed;

	// 🔴 Fails CLOSED, and never throws.
	//
	// This runs inside the CORS middleware, ahead of every route. An exception
	// here does not fail one lookup — it turns every request in the process into
	// a 500, including health checks and requests from origins we already trust.
	// A database blip must degrade cross-origin access, not the whole API.
	//
	// It also keeps the API bootable without a database, which is what unit tests
	// and a cold container both do.
	let allowed = false;
	try {
		const [row] = await db
			.select({ id: quickengineApiKeys.id })
			.from(quickengineApiKeys)
			.where(
				and(
					isNull(quickengineApiKeys.revokedAt),
					sql`${quickengineApiKeys.allowedOrigins} @> ${JSON.stringify([normalized])}::jsonb`,
					sql`(${quickengineApiKeys.expiresAt} is null or ${quickengineApiKeys.expiresAt} > now())`,
				),
			)
			.limit(1);
		allowed = Boolean(row);
	} catch {
		// Deliberately not cached: a transient failure must not lock an origin out
		// for the whole TTL.
		return false;
	}

	cache.set(normalized, { allowed, expiresAt: Date.now() + TTL_MS });
	return allowed;
}

/**
 * The origins registered on one key, normalised.
 *
 * Used when issuing or editing a key so what is stored is already in the shape
 * the browser will send.
 */
export function normalizeOrigins(values: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		const normalized = normalizeOrigin(value);
		// An origin that will not parse cannot be matched against `Origin`, so
		// storing it would silently never work.
		if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
			seen.add(normalized);
		}
	}
	return [...seen];
}

export { eq };
