import { calendarDateSchema } from "@quickengine/mod-projects-tasks/project";
import { z } from "zod";

export const TIME_ENTRY_STATUSES = [
	"running",
	"draft",
	"approved",
	"invoiced",
	"void",
] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

export const trackerKeySchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.min(1)
	.max(100)
	.default("default");

function isIanaTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export const timeEntryTimeZoneSchema = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.refine(isIanaTimeZone, "Invalid IANA time zone");

const MAX_TIME_ENTRY_SECONDS = 31 * 24 * 60 * 60;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

const commonTimeEntryFields = {
	projectId: z.uuid(),
	taskId: z.uuid().nullable().default(null),
	trackerKey: trackerKeySchema,
	description: z.string().trim().max(10_000).nullable().default(null),
	billable: z.boolean().default(true),
	hourlyRateCents: z
		.number()
		.int()
		.nonnegative()
		.max(POSTGRES_INTEGER_MAX)
		.nullable()
		.default(null),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	metadata: z.record(z.string(), z.unknown()).default({}),
} as const;

function rateMatchesBillable(value: {
	billable: boolean;
	hourlyRateCents: number | null;
}) {
	return value.billable || value.hourlyRateCents === null;
}

export const timeEntryDetailsInputSchema = z
	.object(commonTimeEntryFields)
	.refine(rateMatchesBillable, {
		message: "A non-billable entry cannot carry an hourly rate",
		path: ["hourlyRateCents"],
	});

export type TimeEntryDetailsInput = z.input<typeof timeEntryDetailsInputSchema>;

export const manualTimeEntryInputSchema = z
	.object({
		...commonTimeEntryFields,
		source: z.literal("manual").default("manual"),
		workDate: calendarDateSchema,
		durationSeconds: z.number().int().positive().max(MAX_TIME_ENTRY_SECONDS),
	})
	.refine(rateMatchesBillable, {
		message: "A non-billable entry cannot carry an hourly rate",
		path: ["hourlyRateCents"],
	});

export type ManualTimeEntryInput = z.input<typeof manualTimeEntryInputSchema>;
export type ManualTimeEntry = z.output<typeof manualTimeEntryInputSchema>;

export const timerStartInputSchema = z
	.object({
		...commonTimeEntryFields,
		source: z.literal("timer").default("timer"),
		startedAt: z.coerce.date(),
		timeZone: timeEntryTimeZoneSchema,
	})
	.refine(rateMatchesBillable, {
		message: "A non-billable timer cannot carry an hourly rate",
		path: ["hourlyRateCents"],
	});

export type TimerStartInput = z.input<typeof timerStartInputSchema>;
export type TimerStart = z.output<typeof timerStartInputSchema>;

function calendarDateInTimeZone(instant: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(instant);
	const values = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	return `${values.year}-${values.month}-${values.day}`;
}

export function stopTimer(
	startedAt: Date,
	endedAt: Date,
	timeZone: string,
): { workDate: string; durationSeconds: number } {
	timeEntryTimeZoneSchema.parse(timeZone);
	if (endedAt <= startedAt) throw new Error("TIMER_END_MUST_FOLLOW_START");
	const durationSeconds = Math.ceil(
		(endedAt.getTime() - startedAt.getTime()) / 1_000,
	);
	if (durationSeconds > MAX_TIME_ENTRY_SECONDS) {
		throw new Error("TIME_ENTRY_DURATION_EXCEEDED");
	}
	return {
		workDate: calendarDateSchema.parse(
			calendarDateInTimeZone(startedAt, timeZone),
		),
		durationSeconds,
	};
}

const TIME_ENTRY_TRANSITIONS: Record<
	TimeEntryStatus,
	readonly TimeEntryStatus[]
> = {
	running: ["draft", "void"],
	draft: ["approved", "void"],
	approved: ["draft", "invoiced", "void"],
	invoiced: ["approved"],
	void: ["draft"],
};

export function canTransitionTimeEntry(
	from: TimeEntryStatus,
	to: TimeEntryStatus,
): boolean {
	return TIME_ENTRY_TRANSITIONS[from].includes(to);
}

export type TimeRange = { startsAt: Date; endsAt: Date };

/** Half-open ranges allow one timer to start exactly when another stops. */
export function timeRangesOverlap(left: TimeRange, right: TimeRange): boolean {
	return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}
