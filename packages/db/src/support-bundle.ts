import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./client";
import { apiMutations } from "./schema/api-platform";
import {
	quickengineApiKeys,
	quickengineWorkspaces,
} from "./schema/quickengine";
import { webhookDeliveries, webhookEndpoints } from "./schema/webhooks";
import { workspaceModules } from "./schema/workspace-modules";

/**
 * A diagnostic snapshot a customer can hand to support.
 *
 * 🔴 **Built by ALLOWLIST, never by redaction.** Every field below is named
 * explicitly. Nothing does `select()` and strips afterwards, and nothing spreads
 * a database row into the output. That is the whole safety property: a redaction
 * list has to be updated every time a column is added and silently leaks the day
 * somebody forgets, while an allowlist fails closed — a new column simply does
 * not appear until someone decides it should.
 *
 * **Never included, and each for a specific reason:**
 *  - `keyHash`, `secretCiphertext` — credentials, obviously
 *  - `responseBody` on a mutation — replayed customer records: invoice contents,
 *    client details. The status and timing answer the diagnostic question
 *  - webhook delivery `payload` and `responseBody` — the payload IS the customer's
 *    business data, and the response is a third party's
 *  - anything from a module table — no clients, invoices, orders or bookings.
 *    Support needs to know a request failed, not what was in it
 *  - environment variable VALUES anywhere. Names only, as everywhere else
 *
 * **Counts, not contents.** Where volume matters the bundle carries a number.
 * "47 deliveries failed" is the diagnostic fact; the 47 payloads are not.
 */
export type SupportBundle = {
	generatedAt: Date;
	workspace: {
		id: string;
		name: string;
		businessType: string;
		createdAt: Date;
		archived: boolean;
	};
	modules: Array<{ moduleId: string; enabled: boolean }>;
	credentials: Array<{
		name: string;
		type: string;
		/** The public prefix only — never the key, never its hash. */
		prefix: string;
		capabilities: string[];
		lastUsedAt: Date | null;
		expiresAt: Date | null;
		revoked: boolean;
	}>;
	webhooks: {
		endpoints: Array<{
			/** The customer's own URL, which they configured and can already see. */
			url: string;
			enabled: boolean;
			disabledReason: string | null;
			eventTypes: string[];
		}>;
		/** Delivery outcomes over the window, as counts. */
		deliveries: Array<{ status: string; count: number }>;
	};
	/** Recent write attempts: what was called, how it ended, how long it took. */
	recentOperations: Array<{
		operation: string;
		state: string;
		responseStatus: number | null;
		requestId: string;
		startedAt: Date;
		durationMs: number | null;
	}>;
};

const WINDOW_DAYS = 7;

/**
 * Gather the bundle for one workspace.
 *
 * Scoped by `workspaceId` in every query rather than filtered afterwards, so a
 * caller cannot assemble a bundle spanning tenants even by accident.
 */
export async function getSupportBundle(
	workspaceId: string,
	now: Date = new Date(),
): Promise<SupportBundle | undefined> {
	const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			businessType: quickengineWorkspaces.businessType,
			createdAt: quickengineWorkspaces.createdAt,
			archivedAt: quickengineWorkspaces.archivedAt,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) return undefined;

	const [modules, credentials, endpoints, deliveries, operations] =
		await Promise.all([
			db
				.select({
					moduleId: workspaceModules.moduleId,
					enabled: workspaceModules.enabled,
				})
				.from(workspaceModules)
				.where(eq(workspaceModules.workspaceId, workspaceId)),
			db
				.select({
					name: quickengineApiKeys.name,
					type: quickengineApiKeys.type,
					prefix: quickengineApiKeys.prefix,
					capabilities: quickengineApiKeys.capabilities,
					lastUsedAt: quickengineApiKeys.lastUsedAt,
					expiresAt: quickengineApiKeys.expiresAt,
					revokedAt: quickengineApiKeys.revokedAt,
				})
				.from(quickengineApiKeys)
				.where(eq(quickengineApiKeys.workspaceId, workspaceId)),
			db
				.select({
					url: webhookEndpoints.url,
					enabled: webhookEndpoints.enabled,
					disabledReason: webhookEndpoints.disabledReason,
					eventTypes: webhookEndpoints.eventTypes,
				})
				.from(webhookEndpoints)
				.where(eq(webhookEndpoints.workspaceId, workspaceId)),
			db
				.select({
					status: webhookDeliveries.status,
					count: sql<number>`count(*)::int`,
				})
				.from(webhookDeliveries)
				.where(
					and(
						eq(webhookDeliveries.workspaceId, workspaceId),
						gte(webhookDeliveries.createdAt, since),
					),
				)
				.groupBy(webhookDeliveries.status),
			db
				.select({
					operation: apiMutations.operation,
					state: apiMutations.state,
					responseStatus: apiMutations.responseStatus,
					requestId: apiMutations.requestId,
					startedAt: apiMutations.startedAt,
					completedAt: apiMutations.completedAt,
				})
				.from(apiMutations)
				.where(
					and(
						eq(apiMutations.workspaceId, workspaceId),
						gte(apiMutations.startedAt, since),
					),
				)
				.orderBy(desc(apiMutations.startedAt))
				.limit(100),
		]);

	return {
		generatedAt: now,
		workspace: {
			id: workspace.id,
			name: workspace.name,
			businessType: workspace.businessType,
			createdAt: workspace.createdAt,
			archived: workspace.archivedAt !== null,
		},
		modules,
		credentials: credentials.map((row) => ({
			name: row.name,
			type: row.type,
			prefix: row.prefix,
			capabilities: row.capabilities ?? [],
			lastUsedAt: row.lastUsedAt,
			expiresAt: row.expiresAt,
			revoked: row.revokedAt !== null,
		})),
		webhooks: { endpoints, deliveries },
		recentOperations: operations.map((row) => ({
			operation: row.operation,
			state: row.state,
			responseStatus: row.responseStatus,
			requestId: row.requestId,
			startedAt: row.startedAt,
			durationMs: row.completedAt
				? row.completedAt.getTime() - row.startedAt.getTime()
				: null,
		})),
	};
}
