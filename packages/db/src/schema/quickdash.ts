import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const quickdashWorkspaces = pgTable("quickdash_workspaces", {
	id: uuid("id").primaryKey().defaultRandom(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
