import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const quickflowWorkspaces = pgTable("quickflow_workspaces", {
	id: uuid("id").primaryKey().defaultRandom(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
