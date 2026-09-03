import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "./client";
import { apiAuditEvents, apiMutations } from "./schema/api-platform";

export type RequestMutation = {
	id: string;
	operation: string;
	state: string;
	source: string;
	actorType: string;
	actorId: string;
	responseStatus: number | null;
	startedAt: Date;
	completedAt: Date | null;
	/** Milliseconds from start to completion, or `null` while still running. */
	durationMs: number | null;
};

export type RequestAuditEvent = {
	action: string;
	resourceType: string;
	resourceId: string;
	occurredAt: Date;
};

export type RequestTrace = {
	requestId: string;
	mutations: RequestMutation[];
	auditEvents: RequestAuditEvent[];
};

/**
 * Everything this workspace did under one request id.
 *
 * 🔑 Why it exists. Every API response carries `requestId`, and until now that
 * was a number a customer could quote and nobody could look up. Support meant
 * asking for a timestamp and guessing. This turns the id into the thing it was
 * always meant to be: the handle on what actually happened.
 *
 * 🔴 **`responseBody` is deliberately not returned.** It holds the full replayed
 * response for idempotency, which means customer records — invoice contents,
 * client details. This endpoint answers "what happened to my request", not
 * "show me the data again", and a diagnostics surface that quietly re-serves
 * record contents is a data-exposure path nobody audited. `responseStatus` and
 * timing answer the question without it.
 *
 * **Workspace-scoped by argument, not by filter on the result.** A request id is
 * a UUID from another workspace's traffic just as easily as this one's, and
 * scoping after the read would be a lookup across every tenant.
 */
export async function getRequestTrace(
	workspaceId: string,
	requestId: string,
): Promise<RequestTrace> {
	const [mutations, auditEvents] = await Promise.all([
		db
			.select({
				id: apiMutations.id,
				operation: apiMutations.operation,
				state: apiMutations.state,
				source: apiMutations.source,
				actorType: apiMutations.actorType,
				actorId: apiMutations.actorId,
				responseStatus: apiMutations.responseStatus,
				startedAt: apiMutations.startedAt,
				completedAt: apiMutations.completedAt,
			})
			.from(apiMutations)
			.where(
				and(
					eq(apiMutations.workspaceId, workspaceId),
					eq(apiMutations.requestId, requestId),
				),
			)
			.orderBy(desc(apiMutations.startedAt))
			.limit(50),
		db
			.select({
				action: apiAuditEvents.action,
				resourceType: apiAuditEvents.resourceType,
				resourceId: apiAuditEvents.resourceId,
				occurredAt: apiAuditEvents.occurredAt,
			})
			.from(apiAuditEvents)
			.where(
				and(
					eq(apiAuditEvents.workspaceId, workspaceId),
					eq(apiAuditEvents.requestId, requestId),
				),
			)
			.orderBy(desc(apiAuditEvents.occurredAt))
			.limit(50),
	]);

	return {
		requestId,
		mutations: mutations.map((row) => ({
			...row,
			durationMs: row.completedAt
				? row.completedAt.getTime() - row.startedAt.getTime()
				: null,
		})),
		auditEvents,
	};
}

/** One line in the developer console's request stream. */
export type RecentRequest = {
	requestId: string | null;
	operation: string;
	state: string;
	source: string | null;
	actorType: string | null;
	responseStatus: number | null;
	/** Milliseconds, or null while it is still running. */
	durationMs: number | null;
	startedAt: string;
};

/**
 * The last requests this workspace made, newest first.
 *
 * 🔴 `api_mutations` records WRITES only, which is the honest scope: reads are
 * not idempotency-tracked and never were. Calling this a request log would
 * overpromise — it is the log of everything that CHANGED something, which is
 * also the only half anybody debugs.
 *
 * ⚠️ Scoped to the workspace, like everything else here. A developer console
 * that showed another tenant's traffic would be the worst possible leak.
 */
export async function listRecentRequests(
	workspaceId: string,
	options: { limit?: number; failuresOnly?: boolean } = {},
): Promise<RecentRequest[]> {
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
	const rows = await db
		.select({
			requestId: apiMutations.requestId,
			operation: apiMutations.operation,
			state: apiMutations.state,
			source: apiMutations.source,
			actorType: apiMutations.actorType,
			responseStatus: apiMutations.responseStatus,
			startedAt: apiMutations.startedAt,
			completedAt: apiMutations.completedAt,
		})
		.from(apiMutations)
		.where(
			options.failuresOnly
				? and(
						eq(apiMutations.workspaceId, workspaceId),
						// A write that never completed is a failure too, and the one
						// most worth seeing — it is the request that hung.
						or(
							gte(apiMutations.responseStatus, 400),
							isNull(apiMutations.completedAt),
						),
					)
				: eq(apiMutations.workspaceId, workspaceId),
		)
		.orderBy(desc(apiMutations.startedAt))
		.limit(limit);

	return rows.map((row) => ({
		requestId: row.requestId,
		operation: row.operation,
		state: row.state,
		source: row.source,
		actorType: row.actorType,
		responseStatus: row.responseStatus,
		durationMs: row.completedAt
			? row.completedAt.getTime() - row.startedAt.getTime()
			: null,
		startedAt: row.startedAt.toISOString(),
	}));
}
