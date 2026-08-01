import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * How people use QuickEngine itself.
 *
 * 🔴 **NOT the same thing as `reporting_traffic_events`, and they must never
 * merge.** That table is a CUSTOMER's traffic from their own site — their
 * business data, processed on their behalf, readable by them, scoped to their
 * workspace. This table is our product telemetry about the account holder.
 * Mixing them would put one customer's visitors in our funnel numbers and our
 * internal metrics in a table customers can query.
 *
 * **Why Postgres rather than a vendor.** Product events are low volume — signups
 * and activations, not page views. A vendor would add cost, a second privacy
 * surface, another provider that can degrade, and a data-processing agreement,
 * for no capability we lack. Exporting later is a query; un-sending data to a
 * third party is not.
 *
 * ⚠️ **Never store customer or business content here.** No client names, record
 * contents, form data, credentials, or full URLs. `properties` is for
 * dimensions — a module id, a recipe id, an error category — never values. What
 * makes this answerable without that is the question it exists for: *did the
 * person get through*, not *what did they type*.
 */
export const productEvents = pgTable(
	"product_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/**
		 * Canonical `<area>.<verb>` name. Kept as text, not an enum: adding an
		 * event must never require a migration, or nobody will add one and the
		 * funnel stays blind.
		 */
		name: text("name").notNull(),
		/**
		 * Who. Nullable because the most important event in the whole funnel —
		 * landing on signup — happens before anybody has an id.
		 */
		userId: text("user_id"),
		/** The billing entity, when one is resolved. */
		organizationId: uuid("organization_id"),
		/** The workspace in play, for module and activation questions. */
		workspaceId: uuid("workspace_id"),
		/**
		 * Which surface: `web`, `auth`, `account`, `quickdash`, `cli`, `sdk`.
		 * Retention and activation read very differently per surface.
		 */
		surface: text("surface").notNull(),
		/**
		 * Dimensions only — never content. `{ moduleId: "invoicing" }` is a
		 * dimension; `{ clientName: "Ada" }` is a leak.
		 */
		properties: jsonb("properties")
			.$type<Record<string, string | number | boolean | null>>()
			.notNull()
			.default({}),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		// The funnel query: one event name over a window.
		index("product_events_name_time_idx").on(table.name, table.occurredAt),
		// Retention: did this person come back on day 1, 7, 30.
		index("product_events_user_time_idx").on(table.userId, table.occurredAt),
		// Activation per workspace, and module adoption.
		index("product_events_workspace_idx").on(
			table.workspaceId,
			table.occurredAt,
		),
	],
);
