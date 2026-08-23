import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "./client";
import { apiAuditEvents } from "./schema/api-platform";
import { quickengineUsers } from "./schema/quickengine";

/**
 * What happened to a business's records, and who did it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Every financial mutation has been writing an audit row since the beginning,
 * and **nothing could read one.** `api_audit_events` had a writer, three
 * purpose-built indexes and no query — so the answer to "who refunded this
 * order, and when" existed in the database and was reachable only by somebody
 * with psql and the schema in their head.
 *
 * That is the difference between having an audit trail and having evidence. At
 * 2am, with a customer on the phone insisting they were charged twice, a table
 * you cannot read is the same as a table you never wrote.
 *
 * ⚠️ Distinct from `listControlPlaneAudit`, which reads the rows with NO
 * workspace — roles, members, API keys, billing. Those are the account's
 * security log and belong to Account. This is the business's own record of its
 * own records, and the two must not be mixed: an operator asking what happened
 * to an order should not have to read past somebody being invited to the team.
 */
export type WorkspaceAuditEntry = {
	id: string;
	action: string;
	actorType: string;
	actorId: string;
	/**
	 * 🔑 Resolved here, not in the browser.
	 *
	 * A user id in a log is useful only to somebody who can look it up, which is
	 * the opposite of what an audit trail is for. Null when the actor was an API
	 * key or the system rather than a person — and those are exactly the actions
	 * nobody watched happen, so they must never be dropped for lack of a name.
	 */
	actorName: string | null;
	actorEmail: string | null;
	resourceType: string;
	resourceId: string;
	/** Ties this entry to every other record written by the same request. */
	requestId: string;
	/** Where the change came from — the console, the API, a webhook, a job. */
	source: string;
	occurredAt: Date;
	metadata: Record<string, string | number | boolean | null>;
};

export type WorkspaceAuditQuery = {
	limit?: number;
	/**
	 * Narrow to one record — "everything that ever happened to THIS order".
	 *
	 * 🔑 The question people actually arrive with. There is an index for exactly
	 * this shape (`api_audit_events_resource_idx`), so it is a lookup rather than
	 * a scan of the workspace's whole history.
	 */
	resourceType?: string;
	resourceId?: string;
	/**
	 * Narrow to one request.
	 *
	 * 🔴 One customer action can write several rows — an order placed, stock
	 * reserved, a payment recorded. They share a request id, and following it is
	 * how you reconstruct a single click rather than guessing from timestamps
	 * that are milliseconds apart.
	 */
	requestId?: string;
	action?: string;
	/** Keyset cursor: the `occurredAt` of the last row already shown. */
	before?: Date;
};

/**
 * Newest first, workspace-scoped by ARGUMENT rather than filtered afterwards, so
 * an id belonging to another business simply matches nothing.
 */
export async function listWorkspaceAudit(
	workspaceId: string,
	query: WorkspaceAuditQuery = {},
): Promise<WorkspaceAuditEntry[]> {
	const filters = [eq(apiAuditEvents.workspaceId, workspaceId)];
	if (query.resourceType) {
		filters.push(eq(apiAuditEvents.resourceType, query.resourceType));
	}
	if (query.resourceId) {
		filters.push(eq(apiAuditEvents.resourceId, query.resourceId));
	}
	if (query.requestId) {
		filters.push(eq(apiAuditEvents.requestId, query.requestId));
	}
	if (query.action) filters.push(eq(apiAuditEvents.action, query.action));
	/**
	 * ⚠️ Keyset, not offset. An audit log is appended to constantly, so an offset
	 * page 2 fetched a second later silently repeats or skips rows — which in a
	 * log people are reading to reconstruct events is worse than useless.
	 */
	if (query.before) filters.push(lt(apiAuditEvents.occurredAt, query.before));

	return (
		db
			.select({
				id: apiAuditEvents.id,
				action: apiAuditEvents.action,
				actorType: apiAuditEvents.actorType,
				actorId: apiAuditEvents.actorId,
				actorName: quickengineUsers.name,
				actorEmail: quickengineUsers.email,
				resourceType: apiAuditEvents.resourceType,
				resourceId: apiAuditEvents.resourceId,
				requestId: apiAuditEvents.requestId,
				source: apiAuditEvents.source,
				occurredAt: apiAuditEvents.occurredAt,
				metadata: apiAuditEvents.metadata,
			})
			.from(apiAuditEvents)
			// Left: an API key or a background job has no user row, and an inner join
			// would hide precisely the changes no person was present for.
			.leftJoin(
				quickengineUsers,
				eq(quickengineUsers.id, apiAuditEvents.actorId),
			)
			.where(and(...filters))
			.orderBy(desc(apiAuditEvents.occurredAt))
			.limit(Math.min(Math.max(query.limit ?? 50, 1), 200))
	);
}
