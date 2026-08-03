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

const isApiCapability = (value: string): value is ApiCapability =>
	(API_CAPABILITIES as readonly string[]).includes(value);

function hashKey(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

// Keep only known capabilities, and clamp publishable keys to the read-only allowlist.
function normalizeCapabilities(
	type: QuickEngineApiKeyType,
	requested: readonly string[],
): ApiCapability[] {
	// 🔴 The clamp is per TYPE and happens here, once. A caller asking a
	// browser-safe key for `payments:write` gets it silently dropped rather than
	// an error, because the request is almost always a misconfigured integration
	// rather than an attack — and a key that quietly holds less is safe, while a
	// key that quietly holds more is not.
	const allowed =
		type === "publishable"
			? PUBLISHABLE_CAPABILITIES
			: type === "storefront"
				? STOREFRONT_CAPABILITIES
				: API_CAPABILITIES;
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
};

export async function issueApiKey(input: {
	workspaceId: string;
	createdByUserId: string;
	name: string;
	type: QuickEngineApiKeyType;
	capabilities: readonly string[];
	expiresAt?: Date | null;
}): Promise<IssuedApiKey> {
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
		})
		.returning({ id: quickengineApiKeys.id });

	return { id: row.id, plaintext, prefix, capabilities };
}

export type VerifiedApiKey = {
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
