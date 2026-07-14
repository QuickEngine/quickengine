import {
	type AnyPgColumn,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { quickengineWorkspaces } from "./quickengine";

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name"),
		clientEmail: text("client_email"),
		name: text("name").notNull(),
		description: text("description"),
		status: text("status", {
			enum: ["draft", "active", "on_hold", "completed", "cancelled"],
		})
			.notNull()
			.default("draft"),
		startDate: date("start_date", { mode: "string" }),
		dueDate: date("due_date", { mode: "string" }),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("projects_workspace_idx").on(table.workspaceId),
		index("projects_workspace_status_idx").on(table.workspaceId, table.status),
		index("projects_client_idx").on(table.clientId),
	],
);

export const projectMilestones = pgTable(
	"project_milestones",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		status: text("status", { enum: ["open", "completed", "cancelled"] })
			.notNull()
			.default("open"),
		dueDate: date("due_date", { mode: "string" }),
		position: integer("position").notNull().default(0),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("project_milestones_workspace_idx").on(table.workspaceId),
		index("project_milestones_project_position_idx").on(
			table.projectId,
			table.position,
		),
		index("project_milestones_project_status_idx").on(
			table.projectId,
			table.status,
		),
	],
);

export const projectTasks = pgTable(
	"project_tasks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		milestoneId: uuid("milestone_id").references(() => projectMilestones.id, {
			onDelete: "set null",
		}),
		parentTaskId: uuid("parent_task_id").references(
			(): AnyPgColumn => projectTasks.id,
			{ onDelete: "set null" },
		),
		kind: text("kind", { enum: ["task", "deliverable"] })
			.notNull()
			.default("task"),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status", {
			enum: ["todo", "in_progress", "blocked", "completed", "cancelled"],
		})
			.notNull()
			.default("todo"),
		priority: text("priority", {
			enum: ["low", "normal", "high", "urgent"],
		})
			.notNull()
			.default("normal"),
		startDate: date("start_date", { mode: "string" }),
		dueDate: date("due_date", { mode: "string" }),
		estimatedMinutes: integer("estimated_minutes"),
		position: integer("position").notNull().default(0),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("project_tasks_workspace_idx").on(table.workspaceId),
		index("project_tasks_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		index("project_tasks_project_position_idx").on(
			table.projectId,
			table.position,
		),
		index("project_tasks_project_status_idx").on(table.projectId, table.status),
		index("project_tasks_milestone_idx").on(table.milestoneId),
		index("project_tasks_parent_idx").on(table.parentTaskId),
	],
);
