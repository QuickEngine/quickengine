import { desc, eq } from "drizzle-orm";
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
