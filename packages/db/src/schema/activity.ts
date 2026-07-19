import {
	bigserial,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// The persisted domain-event stream, workspace-scoped — the durable "what happened"
// feed. The event bus's in-process consumer writes one row per committed domain event.
// Rows are tiny (identity + provenance only, never customer/payment data), mirroring
// the event envelope; the UI joins back to the live record when it needs detail.
export const workspaceActivity = pgTable(
	"workspace_activity",
	{
		// Monotonic stream sequence — total ordering of the log, and the cursor the
		// feed paginates on (deferred from the QuickEvents versioning decision).
		seq: bigserial("seq", { mode: "number" }).primaryKey(),
		// The domain-event id. Unique so writes are idempotent: a replay or a future
		// durable backstop can `onConflictDoNothing` instead of double-writing.
		id: uuid("id").notNull().unique(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		// Canonical "<module>.<entity>.<verb>" event name.
		name: text("name").notNull(),
		// The affected record. Text (not a FK): events come from many module tables,
		// and the record may since have been deleted.
		recordId: text("record_id").notNull(),
		// Who caused it — user id or api-key id. Null for system-originated events.
		actorId: text("actor_id"),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		// The feed query: latest-first within one workspace.
		index("workspace_activity_workspace_idx").on(table.workspaceId, table.seq),
	],
);
