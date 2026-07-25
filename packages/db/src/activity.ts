import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "./client";
import { workspaceActivity } from "./schema/activity";

// A committed domain event, as the activity store needs it. Structurally the same as
// the event bus's DomainEvent, but defined here so the db layer doesn't depend on the
// events package (the app wires the two together).
export type ActivityInput = {
	id: string;
	workspaceId: string;
	name: string;
	recordId: string;
	actorId?: string | null;
	occurredAt: Date;
};

export type ActivityRow = {
	seq: number;
	id: string;
	workspaceId: string;
	name: string;
	recordId: string;
	actorId: string | null;
	occurredAt: Date;
};

// Persist one domain event. Idempotent on the event id, so a replay (or a future
// durable backstop writing the same event) is a no-op rather than a duplicate row.
export async function recordActivity(event: ActivityInput): Promise<void> {
	await db
		.insert(workspaceActivity)
		.values({
			id: event.id,
			workspaceId: event.workspaceId,
			name: event.name,
			recordId: event.recordId,
			actorId: event.actorId ?? null,
			occurredAt: event.occurredAt,
		})
		.onConflictDoNothing({ target: workspaceActivity.id });
}

// The workspace activity feed: most recent first, bounded.
export async function listWorkspaceActivity(
	workspaceId: string,
	limit = 50,
): Promise<ActivityRow[]> {
	return db
		.select()
		.from(workspaceActivity)
		.where(eq(workspaceActivity.workspaceId, workspaceId))
		.orderBy(desc(workspaceActivity.seq))
		.limit(limit);
}

/**
 * Everything that happened after `cursor`, oldest first — the catch-up read.
 *
 * A browser only learns "something changed" from realtime; if it was disconnected
 * it hears nothing at all. On reconnect it asks for events after the highest
 * `seq` it has seen, so a dropped connection costs it nothing. Ascending order
 * matters: the client applies them in the order they occurred and keeps the last
 * `seq` as its new cursor.
 *
 * `seq` is a monotonic bigserial, so this is a keyset read — it stays correct and
 * fast however far behind the client is, unlike an offset.
 */
export async function listWorkspaceActivitySince(
	workspaceId: string,
	cursor: number,
	limit = 100,
): Promise<ActivityRow[]> {
	return db
		.select()
		.from(workspaceActivity)
		.where(
			and(
				eq(workspaceActivity.workspaceId, workspaceId),
				gt(workspaceActivity.seq, cursor),
			),
		)
		.orderBy(asc(workspaceActivity.seq))
		.limit(Math.min(Math.max(limit, 1), 500));
}

/** The newest sequence number in a workspace, or 0 when nothing has happened. */
export async function latestActivitySeq(workspaceId: string): Promise<number> {
	const [row] = await db
		.select({ seq: workspaceActivity.seq })
		.from(workspaceActivity)
		.where(eq(workspaceActivity.workspaceId, workspaceId))
		.orderBy(desc(workspaceActivity.seq))
		.limit(1);
	return row?.seq ?? 0;
}
