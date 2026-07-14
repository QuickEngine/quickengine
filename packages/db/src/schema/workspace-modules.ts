import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// The workspace-module registry — which modules a workspace has enabled and how each
// is configured. This is the hinge that makes the dashboard configurable: the module
// manifest *describes* a module (in code), and a row here *enables + configures* it
// for one workspace. `module_id` is the manifest id (e.g. "invoicing") — a code
// identifier, deliberately NOT a DB foreign key (modules are packages, not rows).
export const workspaceModules = pgTable(
	"workspace_modules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		moduleId: text("module_id").notNull(),
		enabled: boolean("enabled").notNull().default(true),
		// Per-workspace values for this module's `settingsSchema`. Seeded from the
		// module's `defaultSettings` on enable; validated against the schema on save.
		settings: jsonb("settings")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// One row per module per workspace.
		uniqueIndex("workspace_modules_ws_module_idx").on(
			table.workspaceId,
			table.moduleId,
		),
		index("workspace_modules_workspace_idx").on(table.workspaceId),
	],
);
