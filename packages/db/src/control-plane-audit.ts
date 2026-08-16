import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { apiAuditEvents } from "./schema/api-platform";
import { quickengineUsers } from "./schema/quickengine";

/**
 * Record something that happened to an ORGANIZATION rather than a workspace.
 *
 * 🔴 **Why this exists.** Every module data write goes through the mutation unit
 * of work and is fully audited. The plane that controls access to those modules
 * wrote nothing at all: creating, editing or deleting a custom role and its
 * capability set; adding or removing a member; issuing or revoking an API key;
 * changing a subscription; archiving or discarding a workspace. **A member could
 * be granted `billing.manage` and later removed with no evidence anyone did it.**
 *
 * The blocker was structural, not an oversight in one route: `workspace_id` was
 * `NOT NULL`, and none of these actions has a workspace. Migration `0050` relaxed
 * it and added a check that a row still carries at least one scope.
 *
 * **Not a durable mutation, and deliberately so.** These are direct writes in
 * `rbac.ts`, `orgs.ts` and the account routes — not commands with an execution
 * context — so routing them through the unit of work would mean rewriting the
 * whole control plane. An audit row that is written immediately after the change
 * is far better than one that is never written, and the alternative was months of
 * refactor before the first record appeared.
 *
 * ⚠️ **Never throws.** An audit failure must not undo a role change that already
 * committed; that would leave the caller believing it failed while it succeeded.
 * A missing row is visible in the feed; a phantom rollback is not.
 */
export async function recordControlPlaneAudit(input: {
	organizationId: string;
	actorId: string;
	actorType: "user" | "api_key";
	/** `role.created`, `member.removed`, `apikey.revoked`, and so on. */
	action: string;
	resourceType: string;
	resourceId: string;
	requestId: string;
	/**
	 * Dimensions only — a role name, a capability count, a plan id. Never a
	 * secret, and never a customer record.
	 */
	metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
	try {
		await db.insert(apiAuditEvents).values({
			// No workspace: that is the entire point of this table now allowing one.
			workspaceId: null,
			organizationId: input.organizationId,
			actorId: input.actorId,
			actorType: input.actorType,
			action: input.action,
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			requestId: input.requestId,
			source: "api",
			metadata: input.metadata ?? {},
		});
	} catch {
		// See above. The change already committed; losing its record is the lesser
		// failure and must not surface as one.
	}
}

export type ControlPlaneAuditEntry = {
	id: string;
	action: string;
	actorId: string;
	actorType: string;
	/** 🔑 Resolved here, not in the browser. A user id in a log is only useful to
	 * whoever can look it up, which is the opposite of what an audit trail is
	 * for. Null when the actor was an API key rather than a person. */
	actorName: string | null;
	actorEmail: string | null;
	resourceType: string;
	resourceId: string;
	/** Ties the entry to every other record of the same request. */
	requestId: string;
	occurredAt: Date;
	metadata: Record<string, string | number | boolean | null>;
};

/**
 * What has happened to this organization, newest first.
 *
 * Org-scoped by argument rather than filtered afterwards, so an id belonging to
 * somebody else simply matches nothing.
 */
export async function listControlPlaneAudit(
	organizationId: string,
	options: { limit?: number; action?: string } = {},
): Promise<ControlPlaneAuditEntry[]> {
	const filters = [
		eq(apiAuditEvents.organizationId, organizationId),
		// Control-plane rows only. A workspace's module writes belong to the
		// workspace activity feed, not to the account's security log.
		isNull(apiAuditEvents.workspaceId),
	];
	if (options.action) filters.push(eq(apiAuditEvents.action, options.action));

	return (
		db
			.select({
				id: apiAuditEvents.id,
				action: apiAuditEvents.action,
				actorId: apiAuditEvents.actorId,
				actorType: apiAuditEvents.actorType,
				actorName: quickengineUsers.name,
				actorEmail: quickengineUsers.email,
				resourceType: apiAuditEvents.resourceType,
				resourceId: apiAuditEvents.resourceId,
				requestId: apiAuditEvents.requestId,
				occurredAt: apiAuditEvents.occurredAt,
				metadata: apiAuditEvents.metadata,
			})
			.from(apiAuditEvents)
			// Left: an API key actor has no user row, and dropping those rows would
			// hide exactly the actions nobody watched a person perform.
			.leftJoin(
				quickengineUsers,
				eq(quickengineUsers.id, apiAuditEvents.actorId),
			)
			.where(and(...filters))
			.orderBy(desc(apiAuditEvents.occurredAt))
			.limit(Math.min(Math.max(options.limit ?? 50, 1), 200))
	);
}

/** Every distinct action recorded, for the filter. */
export async function listControlPlaneAuditActions(
	organizationId: string,
): Promise<string[]> {
	const rows = await db
		.selectDistinct({ action: apiAuditEvents.action })
		.from(apiAuditEvents)
		.where(
			and(
				eq(apiAuditEvents.organizationId, organizationId),
				isNull(apiAuditEvents.workspaceId),
			),
		)
		.orderBy(asc(apiAuditEvents.action));
	return rows.map((row) => row.action);
}
