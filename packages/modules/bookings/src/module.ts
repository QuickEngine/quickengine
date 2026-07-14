import { z } from "zod";
import { timeZoneSchema } from "./booking";

export const bookingsSettingsSchema = z.object({
	defaultTimeZone: timeZoneSchema.default("UTC"),
	defaultDurationMinutes: z.number().int().positive().max(10_080).default(60),
	allowClientCancellation: z.boolean().default(true),
	cancellationNoticeHours: z
		.number()
		.int()
		.nonnegative()
		.max(8_760)
		.default(24),
});

export type BookingsSettings = z.infer<typeof bookingsSettingsSchema>;

export const bookingsModule = {
	id: "bookings",
	name: "Bookings & Scheduling",
	description:
		"Schedule client appointments for services across independent calendars.",
	kind: "domain",
	dependsOn: ["client-records", "products-services"] as const,
	// An appointment is the customer's business outcome, not infrastructure usage.
	meteredAction: null,
	settingsSchema: bookingsSettingsSchema,
	defaultSettings: bookingsSettingsSchema.parse({}),
} as const;
