import { sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { invoices } from "./invoices";
import { projects, projectTasks } from "./projects-tasks";
import { quickengineWorkspaces } from "./quickengine";

export const timeEntries = pgTable(
	"time_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		projectId: uuid("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		projectName: text("project_name").notNull(),
		taskId: uuid("task_id").references(() => projectTasks.id, {
			onDelete: "set null",
		}),
		taskTitle: text("task_title"),
		clientIdSnapshot: uuid("client_id_snapshot"),
		clientName: text("client_name"),
		trackerKey: text("tracker_key").notNull().default("default"),
		source: text("source", { enum: ["manual", "timer"] }).notNull(),
		status: text("status", {
			enum: ["running", "draft", "approved", "invoiced", "void"],
		})
			.notNull()
			.default("draft"),
		workDate: date("work_date", { mode: "string" }),
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		durationSeconds: integer("duration_seconds").notNull().default(0),
		timeZone: text("time_zone"),
		description: text("description"),
		billable: boolean("billable").notNull().default(true),
		hourlyRateCents: integer("hourly_rate_cents"),
		currency: text("currency").notNull().default("USD"),
		billableSeconds: integer("billable_seconds"),
		amountCents: integer("amount_cents"),
		billingRoundingMode: text("billing_rounding_mode", {
			enum: ["none", "nearest", "up", "down"],
		}),
		billingIncrementMinutes: integer("billing_increment_minutes"),
		invoiceId: uuid("invoice_id").references(() => invoices.id, {
			onDelete: "restrict",
		}),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
		voidedAt: timestamp("voided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("time_entries_workspace_idx").on(table.workspaceId),
		index("time_entries_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		index("time_entries_workspace_date_idx").on(
			table.workspaceId,
			table.workDate,
		),
		index("time_entries_project_idx").on(table.projectId),
		index("time_entries_task_idx").on(table.taskId),
		index("time_entries_invoice_idx").on(table.invoiceId),
		index("time_entries_tracker_time_idx").on(
			table.workspaceId,
			table.trackerKey,
			table.startedAt,
			table.endedAt,
		),
		uniqueIndex("time_entries_one_running_tracker_idx")
			.on(table.workspaceId, table.trackerKey)
			.where(sql`${table.status} = 'running'`),
	],
);
