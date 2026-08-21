import { and, db, eq, supplierConnections } from "@quickengine/db";
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

/** The decrypted connection, or null if it cannot be used right now. */
export async function resolveSupplierConnection(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
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
	// customer's order is the worst possible moment.
	if (!row || row.status !== "active" || !row.credentials) return null;

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
