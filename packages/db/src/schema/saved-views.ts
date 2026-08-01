import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineUsers, quickengineWorkspaces } from "./quickengine";

/**
 * A saved filter, sort and column set for one module list.
 *
 * 🔑 The first user-defined workflow layer. Operators return to the same
 * questions daily — orders to ship, unpaid invoices, appointments this week —
 * and rebuilding the filter each morning is the difference between a tool and a
 * database viewer.
 *
 * **Personal, not shared.** `userId` is part of the identity, so two people in a
 * workspace can each keep "my queue" without one overwriting the other.
 * Workspace-shared views are a later decision — sharing changes who may edit and
 * delete a view, which is a permissions question, and adding it later is far
 * cheaper than retracting it.
 *
 * **`state` is stored as JSON deliberately.** It mirrors `ResourceListState` on
 * the client, which gains fields as list surfaces grow. Columns would mean a
 * migration every time a list learns a new filter, and this is presentation
 * state, never anything the backend enforces — a malformed view degrades to an
 * unfiltered list, which is why it can be validated on read rather than
 * constrained by the schema.
 */
export const savedViews = pgTable(
	"saved_views",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		// Deleting a person takes their personal views with them; nobody else can
		// read them, so leaving them behind would be litter nobody can reach.
		userId: text("user_id")
			.notNull()
			.references(() => quickengineUsers.id, { onDelete: "cascade" }),
		/** The module this view belongs to — `invoicing`, `orders`, and so on. */
		moduleId: text("module_id").notNull(),
		name: text("name").notNull(),
		/** Filters, sort and paging, mirroring the client's list state. */
		state: jsonb("state").$type<Record<string, unknown>>().notNull(),
		/** Shown on QuickDash Home rather than only inside its module. */
		pinned: boolean("pinned").notNull().default(false),
		/** Manual ordering within a module, and among pinned views on Home. */
		position: integer("position").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		// The list query: one person's views for one module, in their order.
		index("saved_views_owner_idx").on(
			table.workspaceId,
			table.userId,
			table.moduleId,
			table.position,
		),
		// Home reads pinned views across every module at once.
		index("saved_views_pinned_idx").on(
			table.workspaceId,
			table.userId,
			table.pinned,
		),
		// Two views called "Unpaid" in one module is a mistake every time, and
		// catching it here means the API never has to guess which one was meant.
		uniqueIndex("saved_views_name_idx").on(
			table.workspaceId,
			table.userId,
			table.moduleId,
			table.name,
		),
	],
);
