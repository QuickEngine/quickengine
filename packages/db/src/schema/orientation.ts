import {
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineUsers, quickengineWorkspaces } from "./quickengine";

export const quickdashOrientationStates = pgTable(
	"quickdash_orientation_states",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		orientationVersion: integer("orientation_version").notNull(),
		outcome: text("outcome").$type<"completed" | "skipped">().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("quickdash_orientation_states_user_workspace_idx").on(
			table.userId,
			table.workspaceId,
		),
	],
);
