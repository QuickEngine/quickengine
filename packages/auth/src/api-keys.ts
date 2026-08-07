import { createHash, randomBytes } from "node:crypto";
import { and, db, desc, eq, isNull } from "@quickengine/db";
import type { QuickEngineApiKeyType } from "@quickengine/db/schema/quickengine";
import { quickengineApiKeys } from "@quickengine/db/schema/quickengine";

// Workspace-scoped credentials for the public QuickDash API + Quick.js. Issued and
// managed from Account; verified by the QuickDash API gate. Only the sha256 hash is
// stored — the raw key is shown once at creation and never again. See
// internal/product/API_KEYS.md.

// Single source of truth for API capabilities. A route declares the capability it
// requires; a key must hold it. Grow this one string per new route so the gate, the
// Account UI, and the docs never drift.
export const API_CAPABILITIES = [
	"analytics:read",
	"bookings:read",
	"bookings:write",
	"catalog:read",
	"catalog:write",
	"clients:read",
	"clients:write",
	"contracts:read",
	"contracts:write",
	"events:write",
	"files:read",
	"files:write",
	"fulfillment:read",
	"fulfillment:write",
	"inventory:read",
	"inventory:write",
	"invoicing:read",
	"invoicing:write",
	"orders:read",
	"orders:write",
	"projects:read",
	"projects:write",
	"realtime:read",
	"roles:read",
	"roles:write",
	"payments:read",
	"payments:write",
	"time:read",
	"time:write",
	"webhooks:read",
	"webhooks:write",
	"quotes:read",
	"quotes:write",
	"shipping:read",
	"shipping:write",
	// Place an order and pay for it, from a merchant's own website.
	//
	// 🔴 Deliberately NOT `orders:write`. That capability can create an order for
	// any client in the workspace with any prices the caller names. This one
	// enters through checkout, where the server resolves every price from the
	// catalog and the buyer can only be the person checking out.
	"checkout:write",
] as const;
export type ApiCapability = (typeof API_CAPABILITIES)[number];

// Publishable keys ship in public websites, so they may only carry WEBSITE-SAFE
// operations from this allowlist: reads, plus privacy-minimal telemetry writes (traffic
// events a site reports about itself). Never business-data mutations — orders, records,
// or money — even if requested. (This is how Stripe publishable keys work: a few safe
// writes, not pure read-only.)
export const PUBLISHABLE_CAPABILITIES: readonly ApiCapability[] = [
	"catalog:read",
	"events:write",
];

/**
 * What a STOREFRONT key may carry.
 *
 * A merchant's own website — Gemsutopia calling QuickDash. Like a publishable
 * key it ends up in page source, so it is assumed public. Unlike one, it may
 * complete a purchase.
 *
 * 🔴 `checkout:write` is safe in a browser for exactly one reason: **the client
 * never sends a price.** It sends catalog item ids and quantities, and the
 * server resolves every amount from its own catalog. A key that cannot name an
 * amount cannot buy a gem for one cent.
 *
 * 🔴 `orders:read` is deliberately ABSENT, and this is the subtle one. It reads
 * every order in the workspace, so granting it to a public key would publish the
 * merchant's entire order book — names, addresses, totals. A shopper sees their
 * own orders through a CUSTOMER SESSION (`/v1/customer/orders`), which is scoped
 * to one person by `workspace_customers`. Two different questions, two different
 * credentials.
 */
export const STOREFRONT_CAPABILITIES: readonly ApiCapability[] = [
	"catalog:read",
	"events:write",
	"checkout:write",
];

const KEY_PREFIX: Record<QuickEngineApiKeyType, string> = {
	publishable: "qpk",
	// A distinct prefix so a leaked key is identifiable on sight — in a support
	// ticket, a log, or a public repository — without anyone having to look it up.
	storefront: "qsf",
	secret: "qsk",
	scoped: "qsc",
};

/**
 * Where each key type is allowed to live: a browser, or a server.
 *
 * 🔴 A `Record` keyed by the union, NOT a set or a negation. Adding a fifth key
 * type is a COMPILE ERROR until somebody classifies it here, which is the whole
 * point.
 *
 * This exists because the negation it replaces was silently wrong. The gate read
 * `key.type !== "publishable"` to mean "server key", which was true while
 * publishable was the only browser type. Adding `storefront` broke it in the
 * worst direction: a key designed for page source would have been refused on the
 * browser header and ACCEPTED as a bearer token — handled as a trusted server
 * credential.
 *
 * Nothing about that failure was visible in a diff, and no test caught it. A
 * lookup that must be exhaustive turns the next occurrence into a build failure
 * instead of a vulnerability.
 *
 * ⚠️ `browser` means "assume the value is public". Anything classified browser
 * must survive being printed in page source and pasted into a bug report.
 */
export const KEY_CHANNEL: Record<QuickEngineApiKeyType, "browser" | "server"> =
	{
		publishable: "browser",
		storefront: "browser",
		secret: "server",
		scoped: "server",
	};

/** True when this key type is expected to be public. */
export function isBrowserKeyType(type: QuickEngineApiKeyType): boolean {
	return KEY_CHANNEL[type] === "browser";
}

const isApiCapability = (value: string): value is ApiCapability =>
	(API_CAPABILITIES as readonly string[]).includes(value);

function hashKey(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

/**
 * The capability ceiling for each key type.
 *
 * 🔴 Exhaustive, for the same reason as `KEY_CHANNEL` — and this one matters
 * more. The chained ternary it replaces ended in `: API_CAPABILITIES`, so any
 * key type not explicitly named fell through to **full workspace access**. A new
 * browser-facing type added in a hurry would have been born able to move money.
 *
 * A missing entry is now a build failure rather than a silent grant of
 * everything. Defaults should fail closed; that one failed as open as it gets.
 */
const CAPABILITY_CLAMP: Record<
	QuickEngineApiKeyType,
	readonly ApiCapability[]
> = {
	publishable: PUBLISHABLE_CAPABILITIES,
	storefront: STOREFRONT_CAPABILITIES,
	// Server-side credentials may hold anything; what they actually get is
	// whatever the issuer selected, filtered to real capabilities below.
	secret: API_CAPABILITIES,
	scoped: API_CAPABILITIES,
};

// Keep only known capabilities, and clamp each key type to its ceiling.
function normalizeCapabilities(
	type: QuickEngineApiKeyType,
	requested: readonly string[],
): ApiCapability[] {
	// 🔴 The clamp is per TYPE and happens here, once. A caller asking a
	// browser-safe key for `payments:write` gets it silently dropped rather than
	// an error, because the request is almost always a misconfigured integration
	// rather than an attack — and a key that quietly holds less is safe, while a
	// key that quietly holds more is not.
	const allowed = CAPABILITY_CLAMP[type];
	const set = new Set<ApiCapability>();
	for (const value of requested) {
		if (isApiCapability(value) && allowed.includes(value)) {
			set.add(value);
		}
	}
	return [...set];
}

export type IssuedApiKey = {
	id: string;
	/** The full secret. Shown to the caller ONCE — never stored or retrievable again. */
	plaintext: string;
	/** The non-secret leading chars, safe to persist and display. */
	prefix: string;
	capabilities: ApiCapability[];
	/** As stored — already normalised, so a caller can echo it back truthfully. */
	allowedOrigins: string[];
};

/**
 * Reduce a URL to scheme + host + port.
 *
 * Browsers send exactly this in `Origin`, but somebody configuring a key will
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
 * The origins to store for a key.
 *
 * 🔴 Applied inside `issueApiKey` and `setApiKeyAllowedOrigins`, not left to the
 * caller. A route that forgot to normalise would write a value that can never
 * match an `Origin` header — a key that looks configured in the UI and is
 * refused by every browser. Putting the invariant next to the write means there
 * is no path that can skip it.
 *
 * Anything that will not parse to an http(s) origin is DROPPED rather than
 * stored, for the same reason.
 */
export function normalizeOrigins(values: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		const normalized = normalizeOrigin(value);
		if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
			seen.add(normalized);
		}
	}
	return [...seen];
}

export async function issueApiKey(input: {
	workspaceId: string;
	createdByUserId: string;
	name: string;
	type: QuickEngineApiKeyType;
	capabilities: readonly string[];
	expiresAt?: Date | null;
	/**
	 * Browser origins this key may be presented from.
	 *
	 * 🔴 Required in practice for any key that runs in a browser. A storefront
	 * lives on the customer's own domain, so the API's static CORS allowlist
	 * cannot cover it — the origin is declared here and resolved per request by
	 * `isRegisteredStorefrontOrigin`.
	 *
	 * Normalised here, not by the caller — see `normalizeOrigins`.
	 */
	allowedOrigins?: readonly string[];
}): Promise<IssuedApiKey> {
	const allowedOrigins = normalizeOrigins(input.allowedOrigins ?? []);
	const capabilities = normalizeCapabilities(input.type, input.capabilities);
	const typePrefix = KEY_PREFIX[input.type];
	const secret = randomBytes(32).toString("base64url");
	const plaintext = `${typePrefix}_${secret}`;
	// e.g. "qpk_a1b2c3" — enough to recognise a key without revealing it.
	const prefix = `${typePrefix}_${secret.slice(0, 6)}`;

	const [row] = await db
		.insert(quickengineApiKeys)
		.values({
			workspaceId: input.workspaceId,
			createdByUserId: input.createdByUserId,
			name: input.name,
			type: input.type,
			prefix,
			keyHash: hashKey(plaintext),
			capabilities,
			expiresAt: input.expiresAt ?? null,
			allowedOrigins,
		})
		.returning({ id: quickengineApiKeys.id });

	return { id: row.id, plaintext, prefix, capabilities, allowedOrigins };
}

export type VerifiedApiKey = {
	allowedOrigins: string[];
	id: string;
	workspaceId: string;
	type: QuickEngineApiKeyType;
	capabilities: ApiCapability[];
};

/**
 * Resolve a raw key to its workspace + capabilities, or null if it is unknown, revoked,
 * or expired. Records best-effort last-used; a failure there never fails verification.
 */
export async function verifyApiKey(
	rawKey: string,
): Promise<VerifiedApiKey | null> {
	const trimmed = rawKey.trim();
	if (!trimmed) return null;

	const [row] = await db
		.select({
			allowedOrigins: quickengineApiKeys.allowedOrigins,
			id: quickengineApiKeys.id,
			workspaceId: quickengineApiKeys.workspaceId,
			type: quickengineApiKeys.type,
			capabilities: quickengineApiKeys.capabilities,
			expiresAt: quickengineApiKeys.expiresAt,
			revokedAt: quickengineApiKeys.revokedAt,
		})
		.from(quickengineApiKeys)
		.where(eq(quickengineApiKeys.keyHash, hashKey(trimmed)))
		.limit(1);

	if (!row || row.revokedAt) return null;
	if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

	try {
		await db
			.update(quickengineApiKeys)
			.set({ lastUsedAt: new Date() })
			.where(eq(quickengineApiKeys.id, row.id));
	} catch {
		// last-used is best-effort; never fail verification on it.
	}

	return {
		allowedOrigins: row.allowedOrigins ?? [],
		id: row.id,
		workspaceId: row.workspaceId,
		type: row.type,
		capabilities: (row.capabilities ?? []).filter(isApiCapability),
	};
}

export type ApiKeySummary = {
	id: string;
	name: string;
	type: QuickEngineApiKeyType;
	prefix: string;
	capabilities: ApiCapability[];
	allowedOrigins: string[];
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
};

/** Non-secret metadata for every key in a workspace, newest first. */
export async function listApiKeys(
	workspaceId: string,
): Promise<ApiKeySummary[]> {
	const rows = await db
		.select({
			id: quickengineApiKeys.id,
			name: quickengineApiKeys.name,
			type: quickengineApiKeys.type,
			prefix: quickengineApiKeys.prefix,
			capabilities: quickengineApiKeys.capabilities,
			// Public by nature — the whole point is that a named website may present
			// this key. Showing them is what lets an operator answer "why is my site
			// getting refused?" without opening the database.
			allowedOrigins: quickengineApiKeys.allowedOrigins,
			lastUsedAt: quickengineApiKeys.lastUsedAt,
			expiresAt: quickengineApiKeys.expiresAt,
			revokedAt: quickengineApiKeys.revokedAt,
			createdAt: quickengineApiKeys.createdAt,
		})
		.from(quickengineApiKeys)
		.where(eq(quickengineApiKeys.workspaceId, workspaceId))
		.orderBy(desc(quickengineApiKeys.createdAt));

	return rows.map((row) => ({
		...row,
		capabilities: (row.capabilities ?? []).filter(isApiCapability),
	}));
}

/**
 * Replace which browser origins may present a key.
 *
 * Returns false when the key does not belong to this workspace, which is what
 * makes a key id from another organization answer "not found" rather than
 * confirming it exists.
 *
 * ⚠️ The caller must drop the origin cache afterwards (`forgetOriginCache`);
 * this function only writes the row.
 */
export async function setApiKeyAllowedOrigins(
	workspaceId: string,
	keyId: string,
	origins: readonly string[],
): Promise<string[] | null> {
	const allowedOrigins = normalizeOrigins(origins);
	const [row] = await db
		.update(quickengineApiKeys)
		.set({ allowedOrigins, updatedAt: new Date() })
		.where(
			and(
				eq(quickengineApiKeys.id, keyId),
				eq(quickengineApiKeys.workspaceId, workspaceId),
				// A revoked key is not editable. Re-pointing a dead credential at a new
				// domain would look like it re-enabled it.
				isNull(quickengineApiKeys.revokedAt),
			),
		)
		.returning({ id: quickengineApiKeys.id });
	// Null, not an empty array — "no such key" and "this key now allows nothing"
	// are different answers and the route maps them to different statuses.
	return row ? allowedOrigins : null;
}

/** Revoke a key. Returns false if it does not belong to the workspace or was already revoked. */
export async function revokeApiKey(
	workspaceId: string,
	keyId: string,
): Promise<boolean> {
	const now = new Date();
	const [row] = await db
		.update(quickengineApiKeys)
		.set({ revokedAt: now, updatedAt: now })
		.where(
			and(
				eq(quickengineApiKeys.id, keyId),
				eq(quickengineApiKeys.workspaceId, workspaceId),
				isNull(quickengineApiKeys.revokedAt),
			),
		)
		.returning({ id: quickengineApiKeys.id });
	return Boolean(row);
}
