import { z } from "zod";
import { billingRoundingSchema } from "./billing";
import { timeEntryTimeZoneSchema } from "./time-entry";

export const timeTrackingSettingsSchema = z.object({
	defaultBillable: z.boolean().default(true),
	defaultHourlyRateCents: z
		.number()
		.int()
		.nonnegative()
		.max(2_147_483_647)
		.nullable()
		.default(null),
	defaultCurrency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	defaultTimeZone: timeEntryTimeZoneSchema.default("UTC"),
	billingRounding: billingRoundingSchema.default({
		mode: "none",
		incrementMinutes: 1,
	}),
	requireApprovalBeforeInvoicing: z.boolean().default(true),
});

export type TimeTrackingSettings = z.infer<typeof timeTrackingSettingsSchema>;

export const timeTrackingModule = {
	id: "time-tracking",
	name: "Time Tracking",
	description:
		"Record manual work or live timers against projects and turn approved billable time into invoice lines.",
	kind: "domain",
	dependsOn: ["projects-tasks", "invoicing"] as const,
	// Recording work is a business outcome, not infrastructure usage.
	meteredAction: null,
	settingsSchema: timeTrackingSettingsSchema,
	defaultSettings: timeTrackingSettingsSchema.parse({}),
	firstActions: [
		{
			id: "time-tracking:create",
			version: 1,
			label: "Log your first time entry",
			description: "Record work against a project or task.",
			moduleId: "time-tracking",
			intent: "create",
			priority: 35,
			requires: ["projects-tasks:create"],
		},
	] as const,
} as const;
