import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// Privacy-minimal traffic facts. Raw visitor/session identifiers and full referrer
// URLs never enter the database; callers are authenticated at the future ingestion
// boundary and this table keeps only workspace-salted hashes plus a clean path/host.
export const reportingTrafficEvents = pgTable(
	"reporting_traffic_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		eventId: text("event_id").notNull(),
		siteKey: text("site_key").notNull(),
		visitorHash: text("visitor_hash").notNull(),
		sessionHash: text("session_hash").notNull(),
		path: text("path").notNull(),
		referrerHost: text("referrer_host"),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("reporting_traffic_workspace_event_idx").on(
			table.workspaceId,
			table.eventId,
		),
		index("reporting_traffic_workspace_time_idx").on(
			table.workspaceId,
			table.occurredAt,
		),
		index("reporting_traffic_workspace_site_time_idx").on(
			table.workspaceId,
			table.siteKey,
			table.occurredAt,
		),
	],
);
