import { and, db, eq, supplierConnections } from "@quickengine/db";
import { z } from "zod";
import type { SupplierConnection } from "./handoff";
import {
	decryptSupplierCredentials,
	describeSupplierCredentials,
	encryptSupplierCredentials,
	type SupplierCredentials,
} from "./supplier-credentials";

/**
 * Reading and writing a supplier's automated connection.
 *
 * 🔴 `resolveSupplierConnection` is the ONLY way a credential is decrypted for
 * use. It fails closed on every path — missing row, inactive status,
 * undecryptable blob — and returns null rather than throwing, because every
 * caller's correct response to "no usable connection" is the same: leave the
 * purchase order for a human and say why.
 */

/**
 * What connecting a supplier's system requires.
 *
 * ⚠️ Shared with the OpenAPI request map so the documented body and the parsed
 * body cannot drift. `openapi.ts`, `openapi-requests.ts` and
 * `openapi-examples.ts` are linked by operationId STRINGS, which no import graph
 * can see — see hard rule 13.
 */
export const supplierConnectionInputSchema = z.object({
	supplierId: z.uuid(),
	provider: z.string().min(1).max(40),
	shopDomain: z.string().min(1).max(255),
	/** 🔴 Write-only. Never echoed back by any route. */
	adminAccessToken: z.string().min(1).max(500),
	webhookSecret: z.string().max(500).optional(),
	/** Pinned, so a provider moving its API forward does not move ours. */
	apiVersion: z.string().min(1).max(20),
});

/** Which connection to verify. */
export const supplierConnectionCheckSchema = z.object({
	supplierId: z.uuid(),
	provider: z.string().min(1).max(40),
});

/** The decrypted connection, or null if it cannot be used right now. */
export async function resolveSupplierConnection(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
	/**
	 * 🔴 For the CHECK path only, and it is load-bearing.
	 *
	 * A connection is saved `pending` because nothing has proven the token yet,
	 * and everything below refuses `pending` for exactly that reason. But the
	 * check is the thing that PROVES it — so with a single strict rule the two
	 * deadlock: pending cannot be checked, so it never becomes active, so it can
	 * never be used. A connection could be saved and then never work.
	 *
	 * ⚠️ Never pass this from a dispatch path. Placing a real order against an
	 * unverified credential is the failure this whole guard exists to prevent.
	 */
	allowUnverified?: boolean;
}): Promise<SupplierConnection | null> {
	const [row] = await db
		.select()
		.from(supplierConnections)
		.where(
			and(
				eq(supplierConnections.workspaceId, input.workspaceId),
				eq(supplierConnections.supplierId, input.supplierId),
				eq(supplierConnections.provider, input.provider),
			),
		)
		.limit(1);

	// ⚠️ `pending` is deliberately refused alongside `failed`. A connection nobody
	// has verified is not evidence that a token works, and finding out during a
	// customer's order is the worst possible moment. The check path opts out —
	// see `allowUnverified` above — because it is what does the verifying.
	if (!row || !row.credentials) return null;
	// Any stored status is worth CHECKING — `pending` has never been tried, and
	// `failed` is exactly what somebody re-checks after fixing a token.
	if (!input.allowUnverified && row.status !== "active") return null;

	let credentials: SupplierCredentials;
	try {
		credentials = decryptSupplierCredentials(row.credentials);
	} catch {
		// Real after a BETTER_AUTH_SECRET rotation. Not an exception — a reconnect.
		return null;
	}

	return {
		id: row.id,
		workspaceId: row.workspaceId,
		supplierId: row.supplierId,
		provider: row.provider as SupplierConnection["provider"],
		shopDomain: credentials.shopDomain,
		apiVersion: credentials.apiVersion,
		adminAccessToken: credentials.adminAccessToken,
		webhookSecret: credentials.webhookSecret,
	};
}

/**
 * Create or replace a supplier's connection.
 *
 * Upsert by (workspace, supplier, provider) because reconnecting after rotating
 * a token must not leave a second row that inbound webhooks might resolve to.
 * Lands as `pending`: nothing has proven the credential works yet, and saying it
 * is active before anything has spoken to the provider is how a broken
 * connection looks healthy on a settings screen.
 */
export async function saveSupplierConnection(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
	credentials: SupplierCredentials;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	const [saved] = await db
		.insert(supplierConnections)
		.values({
			workspaceId: input.workspaceId,
			supplierId: input.supplierId,
			provider: input.provider,
			externalAccountRef: input.credentials.shopDomain,
			credentials: encryptSupplierCredentials(input.credentials),
			status: "pending",
			lastError: null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				supplierConnections.workspaceId,
				supplierConnections.supplierId,
				supplierConnections.provider,
			],
			set: {
				externalAccountRef: input.credentials.shopDomain,
				credentials: encryptSupplierCredentials(input.credentials),
				status: "pending",
				lastError: null,
				updatedAt: now,
			},
		})
		.returning();
	return saved;
}

/** Record the outcome of actually talking to the provider. */
export async function setSupplierConnectionState(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
	ok: boolean;
	error?: string | null;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	await db
		.update(supplierConnections)
		.set(
			input.ok
				? {
						status: "active",
						lastError: null,
						lastVerifiedAt: now,
						updatedAt: now,
					}
				: { status: "failed", lastError: input.error ?? null, updatedAt: now },
		)
		.where(
			and(
				eq(supplierConnections.workspaceId, input.workspaceId),
				eq(supplierConnections.supplierId, input.supplierId),
				eq(supplierConnections.provider, input.provider),
			),
		);
}

/**
 * What a settings screen may show about a connection.
 *
 * 🔴 Never returns the token. See `describeSupplierCredentials`.
 */
export async function describeSupplierConnection(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
}) {
	const [row] = await db
		.select()
		.from(supplierConnections)
		.where(
			and(
				eq(supplierConnections.workspaceId, input.workspaceId),
				eq(supplierConnections.supplierId, input.supplierId),
				eq(supplierConnections.provider, input.provider),
			),
		)
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		provider: row.provider,
		status: row.status,
		lastError: row.lastError,
		lastVerifiedAt: row.lastVerifiedAt,
		...describeSupplierCredentials(row.credentials),
	};
}
