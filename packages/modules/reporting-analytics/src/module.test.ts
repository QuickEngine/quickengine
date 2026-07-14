import { describe, expect, it } from "vitest";
import {
	reportingAnalyticsModule,
	reportingAnalyticsSettingsSchema,
} from "./module";
import { reportRangeInputSchema } from "./range";
import { trafficEventInputSchema } from "./traffic";

describe("Reporting & Analytics contract", () => {
	it("is a shared unmetered reader with no forced business-module dependency", () => {
		expect(reportingAnalyticsModule).toMatchObject({
			id: "reporting-analytics",
			kind: "shared",
			dependsOn: [],
			meteredAction: null,
		});
	});

	it("uses a real timezone and neutral week defaults", () => {
		expect(reportingAnalyticsSettingsSchema.parse({})).toEqual({
			defaultTimeZone: "UTC",
			weekStartsOn: "monday",
		});
		expect(() =>
			reportingAnalyticsSettingsSchema.parse({ defaultTimeZone: "Moon/Base" }),
		).toThrow();
	});

	it("rejects reversed, oversized, and timezone-invalid report ranges", () => {
		const from = new Date("2026-07-01T00:00:00.000Z");
		expect(() =>
			reportRangeInputSchema.parse({ from, to: from, timeZone: "UTC" }),
		).toThrow();
		expect(() =>
			reportRangeInputSchema.parse({
				from,
				to: new Date("2027-08-01T00:00:00.000Z"),
				timeZone: "UTC",
			}),
		).toThrow();
		expect(() =>
			reportRangeInputSchema.parse({
				from,
				to: new Date("2026-08-01T00:00:00.000Z"),
				timeZone: "Not/AZone",
			}),
		).toThrow();
	});

	it("keeps query strings and raw URLs out of traffic facts", () => {
		expect(() =>
			trafficEventInputSchema.parse({
				eventId: "event-0001",
				siteKey: "main-site",
				visitorId: "visitor-0001",
				sessionId: "session-0001",
				path: "/pricing?email=private@example.com",
				occurredAt: new Date(),
			}),
		).toThrow();
	});
});
