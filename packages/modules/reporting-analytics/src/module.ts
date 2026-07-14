import { z } from "zod";

export const reportingAnalyticsSettingsSchema = z.object({
	defaultTimeZone: z
		.string()
		.trim()
		.refine((value) => {
			try {
				new Intl.DateTimeFormat("en-US", { timeZone: value });
				return true;
			} catch {
				return false;
			}
		}, "Invalid IANA time zone")
		.default("UTC"),
	weekStartsOn: z.enum(["monday", "sunday"]).default("monday"),
});

export const reportingAnalyticsModule = {
	id: "reporting-analytics",
	name: "Reporting & Analytics",
	description:
		"Read module-aware business health, financial, operational, and privacy-minimal traffic reports without inventing data for unavailable modules.",
	kind: "shared",
	dependsOn: [] as const,
	// Reading business results is not a billable action. Future scheduled exports may
	// meter only their actual delivery or file-generation infrastructure.
	meteredAction: null,
	settingsSchema: reportingAnalyticsSettingsSchema,
	defaultSettings: reportingAnalyticsSettingsSchema.parse({}),
} as const;
