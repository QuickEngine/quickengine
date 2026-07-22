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
	firstActions: [
		{
			id: "bookings:create",
			version: 1,
			label: "Create your first booking",
			description: "Schedule a client for one of your services.",
			moduleId: "bookings",
			intent: "create",
			priority: 30,
			requires: ["client-records:create", "products-services:create"],
			steps: [
				{
					id: "bookings:create:booking",
					version: 1,
					label: "Schedule the booking",
					description: "Choose the client, service, date, and time.",
					intent: "create",
				},
				{
					id: "bookings:create:confirm",
					version: 1,
					label: "Confirm the booking",
					description: "Confirm the appointment so it is ready to deliver.",
					intent: "confirm",
				},
			],
		},
	] as const,
} as const;
