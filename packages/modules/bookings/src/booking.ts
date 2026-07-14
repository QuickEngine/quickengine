import { z } from "zod";

export const BOOKING_STATUSES = [
	"requested",
	"confirmed",
	"checked_in",
	"completed",
	"cancelled",
	"no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_LOCATION_KINDS = [
	"in_person",
	"virtual",
	"phone",
	"other",
] as const;

function isIanaTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export const timeZoneSchema = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.refine(isIanaTimeZone, "Invalid IANA time zone");

export const scheduleKeySchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.min(1)
	.max(80)
	.default("default");

const MAX_BOOKING_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export const bookingInputSchema = z
	.object({
		clientId: z.uuid(),
		catalogItemId: z.uuid().nullable().default(null),
		catalogItemVariantId: z.uuid().nullable().default(null),
		title: z.string().trim().min(1).max(200),
		scheduleKey: scheduleKeySchema,
		startsAt: z.coerce.date(),
		endsAt: z.coerce.date(),
		timeZone: timeZoneSchema,
		locationKind: z.enum(BOOKING_LOCATION_KINDS).default("in_person"),
		location: z.string().trim().max(500).nullable().default(null),
		notes: z.string().trim().max(10_000).nullable().default(null),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((booking, context) => {
		if (booking.endsAt <= booking.startsAt) {
			context.addIssue({
				code: "custom",
				message: "Booking end must be after its start",
				path: ["endsAt"],
			});
		}
		if (
			booking.endsAt.getTime() - booking.startsAt.getTime() >
			MAX_BOOKING_DURATION_MS
		) {
			context.addIssue({
				code: "custom",
				message: "Booking duration exceeds 30 days",
				path: ["endsAt"],
			});
		}
		if (booking.catalogItemVariantId && !booking.catalogItemId) {
			context.addIssue({
				code: "custom",
				message: "A booking variant requires its parent catalog item",
				path: ["catalogItemVariantId"],
			});
		}
	});

export type BookingInput = z.input<typeof bookingInputSchema>;
export type Booking = z.output<typeof bookingInputSchema>;

const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
	requested: ["confirmed", "cancelled"],
	confirmed: ["checked_in", "completed", "cancelled", "no_show"],
	checked_in: ["completed", "cancelled"],
	completed: [],
	cancelled: [],
	no_show: [],
};

export function canTransitionBooking(
	from: BookingStatus,
	to: BookingStatus,
): boolean {
	return BOOKING_TRANSITIONS[from].includes(to);
}

export type TimeRange = { startsAt: Date; endsAt: Date };

/** Half-open ranges allow one appointment to begin exactly when another ends. */
export function bookingTimeRangesOverlap(
	left: TimeRange,
	right: TimeRange,
): boolean {
	return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}
