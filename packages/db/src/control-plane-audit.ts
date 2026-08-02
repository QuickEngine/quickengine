import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { apiAuditEvents } from "./schema/api-platform";

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
	action: string;
	actorId: string;
	actorType: string;
	resourceType: string;
	resourceId: string;
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
	limit = 100,
): Promise<ControlPlaneAuditEntry[]> {
	return db
		.select({
			action: apiAuditEvents.action,
			actorId: apiAuditEvents.actorId,
			actorType: apiAuditEvents.actorType,
			resourceType: apiAuditEvents.resourceType,
			resourceId: apiAuditEvents.resourceId,
			occurredAt: apiAuditEvents.occurredAt,
			metadata: apiAuditEvents.metadata,
		})
		.from(apiAuditEvents)
		.where(
			and(
				eq(apiAuditEvents.organizationId, organizationId),
				// Control-plane rows only. A workspace's module writes belong to the
				// workspace activity feed, not to the account's security log.
				isNull(apiAuditEvents.workspaceId),
			),
		)
		.orderBy(desc(apiAuditEvents.occurredAt))
		.limit(limit);
}
