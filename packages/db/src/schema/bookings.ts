import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems, catalogItemVariants } from "./catalog-items";
import { clientRecords } from "./client-records";
import { quickengineWorkspaces } from "./quickengine";

export const bookings = pgTable(
	"bookings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name").notNull(),
		clientEmail: text("client_email"),
		catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
			onDelete: "set null",
		}),
		catalogItemVariantId: uuid("catalog_item_variant_id").references(
			() => catalogItemVariants.id,
			{ onDelete: "set null" },
		),
		title: text("title").notNull(),
		scheduleKey: text("schedule_key").notNull().default("default"),
		status: text("status", {
			enum: [
				"requested",
				"confirmed",
				"checked_in",
				"completed",
				"cancelled",
				"no_show",
			],
		})
			.notNull()
			.default("requested"),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		timeZone: text("time_zone").notNull(),
		locationKind: text("location_kind", {
			enum: ["in_person", "virtual", "phone", "other"],
		})
			.notNull()
			.default("in_person"),
		location: text("location"),
		notes: text("notes"),
		cancellationReason: text("cancellation_reason"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		noShowAt: timestamp("no_show_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("bookings_workspace_idx").on(table.workspaceId),
		index("bookings_workspace_status_idx").on(table.workspaceId, table.status),
		index("bookings_schedule_time_idx").on(
			table.workspaceId,
			table.scheduleKey,
			table.startsAt,
			table.endsAt,
		),
		index("bookings_client_idx").on(table.clientId),
		index("bookings_catalog_item_idx").on(table.catalogItemId),
	],
);
