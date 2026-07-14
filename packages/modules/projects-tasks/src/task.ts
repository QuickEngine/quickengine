import { z } from "zod";
import { calendarDateSchema } from "./project";

export const TASK_KINDS = ["task", "deliverable"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = [
	"todo",
	"in_progress",
	"blocked",
	"completed",
	"cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const taskDetailsFields = {
	projectId: z.uuid(),
	milestoneId: z.uuid().nullable().default(null),
	parentTaskId: z.uuid().nullable().default(null),
	kind: z.enum(TASK_KINDS).default("task"),
	title: z.string().trim().min(1).max(300),
	description: z.string().trim().max(20_000).nullable().default(null),
	priority: z.enum(TASK_PRIORITIES).default("normal"),
	startDate: calendarDateSchema.nullable().default(null),
	dueDate: calendarDateSchema.nullable().default(null),
	estimatedMinutes: z
		.number()
		.int()
		.positive()
		.max(525_600)
		.nullable()
		.default(null),
	position: z.number().int().nonnegative().max(2_147_483_647).default(0),
	metadata: z.record(z.string(), z.unknown()).default({}),
} as const;

function hasValidDateRange(value: {
	startDate: string | null;
	dueDate: string | null;
}) {
	return !value.startDate || !value.dueDate || value.dueDate >= value.startDate;
}

export const taskDetailsInputSchema = z
	.object(taskDetailsFields)
	.refine(hasValidDateRange, {
		message: "Task due date cannot be before its start date",
		path: ["dueDate"],
	});

export const taskInputSchema = z
	.object({
		...taskDetailsFields,
		status: z.enum(TASK_STATUSES).default("todo"),
	})
	.refine(hasValidDateRange, {
		message: "Task due date cannot be before its start date",
		path: ["dueDate"],
	});

export type TaskInput = z.input<typeof taskInputSchema>;
export type Task = z.output<typeof taskInputSchema>;
export type TaskDetailsInput = z.input<typeof taskDetailsInputSchema>;

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
	todo: ["in_progress", "blocked", "completed", "cancelled"],
	in_progress: ["todo", "blocked", "completed", "cancelled"],
	blocked: ["todo", "in_progress", "completed", "cancelled"],
	completed: ["todo", "in_progress"],
	cancelled: ["todo"],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
	return TASK_TRANSITIONS[from].includes(to);
}
