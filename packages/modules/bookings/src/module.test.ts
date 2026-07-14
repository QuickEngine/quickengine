import { describe, expect, it } from "vitest";
import {
	bookingInputSchema,
	bookingTimeRangesOverlap,
	canTransitionBooking,
	scheduleKeySchema,
	timeZoneSchema,
} from "./booking";
import { bookingsModule, bookingsSettingsSchema } from "./module";

const clientId = "00000000-0000-4000-8000-000000000001";
const catalogItemId = "00000000-0000-4000-8000-000000000002";
const catalogItemVariantId = "00000000-0000-4000-8000-000000000003";

function booking(overrides: Record<string, unknown> = {}) {
	return {
		clientId,
		catalogItemId,
		title: "Deep tissue massage",
		startsAt: "2026-08-01T15:00:00.000Z",
		endsAt: "2026-08-01T16:00:00.000Z",
		timeZone: "America/Mexico_City",
		...overrides,
	};
}

describe("bookings module", () => {
	it("composes clients with bookable catalog offerings", () => {
		expect(bookingsModule).toMatchObject({
			id: "bookings",
			dependsOn: ["client-records", "products-services"],
			meteredAction: null,
		});
	});

	it("has practical scheduling defaults", () => {
		expect(bookingsSettingsSchema.parse({})).toEqual({
			defaultTimeZone: "UTC",
			defaultDurationMinutes: 60,
			allowClientCancellation: true,
			cancellationNoticeHours: 24,
		});
	});
});

describe("booking contract", () => {
	it("normalizes a concrete client appointment", () => {
		expect(
			bookingInputSchema.parse(
				booking({ scheduleKey: " Massage-Room-1 ", catalogItemVariantId }),
			),
		).toMatchObject({
			clientId,
			catalogItemId,
			catalogItemVariantId,
			scheduleKey: "massage-room-1",
			locationKind: "in_person",
		});
	});

	it("allows an unlisted appointment without inventing a catalog record", () => {
		expect(
			bookingInputSchema.parse(booking({ catalogItemId: null })),
		).toMatchObject({ catalogItemId: null, catalogItemVariantId: null });
	});

	it("requires a parent offering when a variant is selected", () => {
		expect(() =>
			bookingInputSchema.parse(
				booking({ catalogItemId: null, catalogItemVariantId }),
			),
		).toThrow();
	});

	it("requires a positive bounded time range", () => {
		expect(() =>
			bookingInputSchema.parse(booking({ endsAt: "2026-08-01T14:00:00.000Z" })),
		).toThrow();
		expect(() =>
			bookingInputSchema.parse(booking({ endsAt: "2026-10-01T16:00:00.000Z" })),
		).toThrow();
	});

	it("validates real time zones and stable schedule keys", () => {
		expect(timeZoneSchema.parse("Europe/London")).toBe("Europe/London");
		expect(() => timeZoneSchema.parse("Moon/Sea_of_Tranquility")).toThrow();
		expect(scheduleKeySchema.parse(" Room-A ")).toBe("room-a");
		expect(() => scheduleKeySchema.parse("room a")).toThrow();
	});

	it("allows adjacent appointments but detects actual overlap", () => {
		const first = {
			startsAt: new Date("2026-08-01T15:00:00.000Z"),
			endsAt: new Date("2026-08-01T16:00:00.000Z"),
		};
		expect(
			bookingTimeRangesOverlap(first, {
				startsAt: new Date("2026-08-01T16:00:00.000Z"),
				endsAt: new Date("2026-08-01T17:00:00.000Z"),
			}),
		).toBe(false);
		expect(
			bookingTimeRangesOverlap(first, {
				startsAt: new Date("2026-08-01T15:30:00.000Z"),
				endsAt: new Date("2026-08-01T16:30:00.000Z"),
			}),
		).toBe(true);
	});

	it("tracks confirmation, attendance, completion, cancellation, and no-shows", () => {
		expect(canTransitionBooking("requested", "confirmed")).toBe(true);
		expect(canTransitionBooking("confirmed", "checked_in")).toBe(true);
		expect(canTransitionBooking("checked_in", "completed")).toBe(true);
		expect(canTransitionBooking("confirmed", "no_show")).toBe(true);
		expect(canTransitionBooking("completed", "cancelled")).toBe(false);
		expect(canTransitionBooking("cancelled", "confirmed")).toBe(false);
	});
});
