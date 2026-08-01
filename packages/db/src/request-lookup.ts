import { and, desc, eq } from "drizzle-orm";
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
