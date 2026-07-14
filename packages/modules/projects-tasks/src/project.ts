import { z } from "zod";

export const PROJECT_STATUSES = [
	"draft",
	"active",
	"on_hold",
	"completed",
	"cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

function isRealCalendarDate(value: string): boolean {
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export const calendarDateSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(isRealCalendarDate, "Invalid calendar date");

const projectDetailsFields = {
	clientId: z.uuid().nullable().default(null),
	name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(20_000).nullable().default(null),
	startDate: calendarDateSchema.nullable().default(null),
	dueDate: calendarDateSchema.nullable().default(null),
	metadata: z.record(z.string(), z.unknown()).default({}),
} as const;

function hasValidDateRange(value: {
	startDate: string | null;
	dueDate: string | null;
}) {
	return !value.startDate || !value.dueDate || value.dueDate >= value.startDate;
}

export const projectDetailsInputSchema = z
	.object(projectDetailsFields)
	.refine(hasValidDateRange, {
		message: "Project due date cannot be before its start date",
		path: ["dueDate"],
	});

export const projectInputSchema = z
	.object({
		...projectDetailsFields,
		status: z.enum(PROJECT_STATUSES).default("draft"),
	})
	.refine(hasValidDateRange, {
		message: "Project due date cannot be before its start date",
		path: ["dueDate"],
	});

export type ProjectInput = z.input<typeof projectInputSchema>;
export type Project = z.output<typeof projectInputSchema>;
export type ProjectDetailsInput = z.input<typeof projectDetailsInputSchema>;

const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
	draft: ["active", "cancelled"],
	active: ["on_hold", "completed", "cancelled"],
	on_hold: ["active", "completed", "cancelled"],
	completed: ["active"],
	cancelled: ["draft", "active"],
};

export function canTransitionProject(
	from: ProjectStatus,
	to: ProjectStatus,
): boolean {
	return PROJECT_TRANSITIONS[from].includes(to);
}
