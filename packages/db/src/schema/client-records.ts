import { sql } from "drizzle-orm";
import {
	check,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// Client Records module — the shared record of the people/orgs a workspace deals
// with (customers, clients, students…). Scoped to one workspace. The module owns
// this table (Development Standards: each module owns its own tables). Module
// tables are unprefixed, distinct from the `quickengine_` account-layer tables.
export const clientRecords = pgTable(
	"client_records",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		email: text("email"),
		phone: text("phone"),
		company: text("company"),
		notes: text("notes"),
		// Per-workspace custom fields, so a workspace can extend the record shape
		// beyond the built-in columns without a schema change.
		fields: jsonb("fields")
			.$type<Record<string, string>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("client_records_workspace_idx").on(table.workspaceId)],
);

export const clientAddresses = pgTable(
	"client_addresses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		clientId: uuid("client_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),
		label: text("label"),
		line1: text("line1").notNull(),
		line2: text("line2"),
		city: text("city").notNull(),
		region: text("region"),
		postalCode: text("postal_code"),
		countryCode: text("country_code").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("client_addresses_workspace_client_idx").on(
			table.workspaceId,
			table.clientId,
		),
		check(
			"client_addresses_country_code_check",
			sql`char_length(${table.countryCode}) = 2`,
		),
	],
);
