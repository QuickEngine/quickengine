import { and, db, eq, shippingCarrierConnections } from "@quickengine/db";
import { z } from "zod";
import {
	type CarrierCredentials,
	decryptCarrierCredentials,
	describeCarrierCredentials,
	encryptCarrierCredentials,
} from "./carrier-credentials";

export type CarrierEnvironment = "test" | "live";

/**
 * 🔴 Defined HERE rather than in the route, and the reason is hard rule 13.
 *
 * `openapi-requests.ts` links a request body to its route by operationId
 * STRING — no import graph can see that edge. A schema written inline in the
 * route and copied into the OpenAPI map is two definitions that drift, and the
 * drift surfaces as a documented API that does not match the real one.
 */
export const carrierNameSchema = z.enum(["shippo", "easypost"]);
export const carrierEnvironmentSchema = z.enum(["test", "live"]);

export const carrierConnectionInputSchema = z.object({
	carrier: carrierNameSchema,
	environment: carrierEnvironmentSchema,
	/**
	 * ⚠️ A minimum length, not a format. Every carrier names its tokens
	 * differently and they change the prefix without warning; refusing a valid
	 * token because it did not match a pattern we guessed is worse than letting
	 * the check button find out.
	 */
	apiToken: z.string().trim().min(10).max(500),
	webhookSecret: z.string().trim().max(500).nullable().optional(),
});

export const carrierConnectionCheckSchema = z.object({
	carrier: carrierNameSchema,
	environment: carrierEnvironmentSchema,
});

/**
 * The credential and live state for one business's carrier account.
 *
 * 🔴 `resolveCarrierConnection` is the ONLY way a credential is decrypted for
 * use. Everything else goes through `describeCarrierConnection`, which answers
 * whether a token is present and never what it is.
 *
 * ⚠️ Shaped after `supplier-connections.ts` deliberately, including the
 * `allowUnverified` escape hatch — which exists there because without it the
 * check route could not resolve a connection that had never been checked, and
 * saving a token then immediately testing it reported "no connection". The same
 * deadlock is available here for free, so the same door is open.
 */

/** The decrypted connection, or null if it cannot be used right now. */
export async function resolveCarrierConnection(input: {
	workspaceId: string;
	carrier: string;
	environment: CarrierEnvironment;
	/**
	 * Allow a connection that has never been verified.
	 *
	 * 🔴 Only the CHECK path may pass this. Everything else — quoting a customer,
	 * buying a label — must refuse an unproven credential, because the moment a
	 * customer is waiting is the worst possible time to discover a token is
	 * wrong. The check path opts out because it is what does the verifying.
	 */
	allowUnverified?: boolean;
}): Promise<{ credentials: CarrierCredentials; status: string } | null> {
	const [row] = await db
		.select()
		.from(shippingCarrierConnections)
		.where(
			and(
				eq(shippingCarrierConnections.workspaceId, input.workspaceId),
				eq(shippingCarrierConnections.carrier, input.carrier),
				eq(shippingCarrierConnections.environment, input.environment),
			),
		)
		.limit(1);

	if (!row?.credentials) return null;
	if (!input.allowUnverified && row.status !== "active") return null;

	try {
		return {
			credentials: decryptCarrierCredentials(row.credentials),
			status: row.status,
		};
	} catch {
		// 🔴 Null, not a throw. After a `BETTER_AUTH_SECRET` rotation every stored
		// credential is undecryptable, and a checkout that crashes is worse than
		// one that reports it cannot price delivery — which is exactly what a
		// null produces here.
		return null;
	}
}

/**
 * Store or replace a business's carrier token.
 *
 * ⚠️ Always lands on `pending`, even when replacing a connection that worked.
 * A new token is an unproven token: carrying the old `active` forward would let
 * a mistyped one quote customers until the first failure, and that failure
 * happens in front of somebody trying to buy something.
 */
export async function saveCarrierConnection(input: {
	workspaceId: string;
	carrier: string;
	environment: CarrierEnvironment;
	credentials: CarrierCredentials;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	const encrypted = encryptCarrierCredentials(input.credentials);
	const [saved] = await db
		.insert(shippingCarrierConnections)
		.values({
			workspaceId: input.workspaceId,
			carrier: input.carrier,
			environment: input.environment,
			credentials: encrypted,
			status: "pending",
			lastError: null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				shippingCarrierConnections.workspaceId,
				shippingCarrierConnections.carrier,
				shippingCarrierConnections.environment,
			],
			set: {
				credentials: encrypted,
				status: "pending",
				lastError: null,
				updatedAt: now,
			},
		})
		.returning();
	return saved;
}

/** Record the outcome of actually talking to the carrier. */
export async function setCarrierConnectionState(input: {
	workspaceId: string;
	carrier: string;
	environment: CarrierEnvironment;
	ok: boolean;
	error?: string | null;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	await db
		.update(shippingCarrierConnections)
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
				eq(shippingCarrierConnections.workspaceId, input.workspaceId),
				eq(shippingCarrierConnections.carrier, input.carrier),
				eq(shippingCarrierConnections.environment, input.environment),
			),
		);
}

/** Forget a carrier account entirely. */
export async function deleteCarrierConnection(input: {
	workspaceId: string;
	carrier: string;
	environment: CarrierEnvironment;
}): Promise<boolean> {
	const deleted = await db
		.delete(shippingCarrierConnections)
		.where(
			and(
				eq(shippingCarrierConnections.workspaceId, input.workspaceId),
				eq(shippingCarrierConnections.carrier, input.carrier),
				eq(shippingCarrierConnections.environment, input.environment),
			),
		)
		.returning({ id: shippingCarrierConnections.id });
	return deleted.length > 0;
}

/**
 * What a settings screen may show about every carrier this business connected.
 *
 * 🔴 Never returns a token. See `describeCarrierCredentials`.
 */
export async function listCarrierConnections(workspaceId: string) {
	const rows = await db
		.select()
		.from(shippingCarrierConnections)
		.where(eq(shippingCarrierConnections.workspaceId, workspaceId));
	return rows.map((row) => ({
		id: row.id,
		carrier: row.carrier,
		environment: row.environment,
		status: row.status,
		lastError: row.lastError,
		lastVerifiedAt: row.lastVerifiedAt,
		...describeCarrierCredentials(row.credentials),
	}));
}
