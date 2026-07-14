import { describe, expect, it } from "vitest";
import { calculateTimeAmountCents, roundBillableSeconds } from "./billing";
import { timeTrackingModule, timeTrackingSettingsSchema } from "./module";
import {
	canTransitionTimeEntry,
	manualTimeEntryInputSchema,
	stopTimer,
	timeRangesOverlap,
	timerStartInputSchema,
} from "./time-entry";

const projectId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";

describe("time tracking module", () => {
	it("declares both sides of the project-to-invoice bridge", () => {
		expect(timeTrackingModule).toMatchObject({
			id: "time-tracking",
			dependsOn: ["projects-tasks", "invoicing"],
			meteredAction: null,
		});
	});

	it("defaults to exact, approval-gated billing without inventing a rate", () => {
		expect(timeTrackingSettingsSchema.parse({})).toEqual({
			defaultBillable: true,
			defaultHourlyRateCents: null,
			defaultCurrency: "USD",
			defaultTimeZone: "UTC",
			billingRounding: { mode: "none", incrementMinutes: 1 },
			requireApprovalBeforeInvoicing: true,
		});
	});
});

describe("manual time entries", () => {
	it("records duration truthfully without fake clock times", () => {
		expect(
			manualTimeEntryInputSchema.parse({
				projectId,
				taskId,
				trackerKey: " Asher-Wilson ",
				workDate: "2026-07-14",
				durationSeconds: 7_200,
				hourlyRateCents: 12_500,
			}),
		).toMatchObject({
			projectId,
			taskId,
			trackerKey: "asher-wilson",
			source: "manual",
			billable: true,
			currency: "USD",
		});
	});

	it("rejects impossible dates, durations, and rates on non-billable work", () => {
		expect(() =>
			manualTimeEntryInputSchema.parse({
				projectId,
				workDate: "2026-02-30",
				durationSeconds: 3_600,
			}),
		).toThrow();
		expect(() =>
			manualTimeEntryInputSchema.parse({
				projectId,
				workDate: "2026-07-14",
				durationSeconds: 0,
			}),
		).toThrow();
		expect(() =>
			manualTimeEntryInputSchema.parse({
				projectId,
				workDate: "2026-07-14",
				durationSeconds: 3_600,
				billable: false,
				hourlyRateCents: 10_000,
			}),
		).toThrow();
	});
});

describe("live timers", () => {
	it("normalizes a timer lane and validates its display timezone", () => {
		expect(
			timerStartInputSchema.parse({
				projectId,
				trackerKey: " Designer-1 ",
				startedAt: "2026-07-15T04:30:00.000Z",
				timeZone: "America/Mexico_City",
			}),
		).toMatchObject({ trackerKey: "designer-1", source: "timer" });
		expect(() =>
			timerStartInputSchema.parse({
				projectId,
				startedAt: "2026-07-15T04:30:00.000Z",
				timeZone: "Mars/Olympus_Mons",
			}),
		).toThrow();
	});

	it("derives elapsed seconds and the local work date when stopped", () => {
		expect(
			stopTimer(
				new Date("2026-07-15T04:30:00.000Z"),
				new Date("2026-07-15T05:45:00.250Z"),
				"America/Mexico_City",
			),
		).toEqual({ workDate: "2026-07-14", durationSeconds: 4_501 });
	});

	it("rejects reversed and runaway timer ranges", () => {
		expect(() =>
			stopTimer(
				new Date("2026-07-15T05:00:00.000Z"),
				new Date("2026-07-15T04:00:00.000Z"),
				"UTC",
			),
		).toThrow("TIMER_END_MUST_FOLLOW_START");
		expect(() =>
			stopTimer(
				new Date("2026-01-01T00:00:00.000Z"),
				new Date("2026-03-01T00:00:00.000Z"),
				"UTC",
			),
		).toThrow("TIME_ENTRY_DURATION_EXCEEDED");
	});

	it("allows adjacent timers but detects actual overlap", () => {
		const first = {
			startsAt: new Date("2026-07-14T12:00:00.000Z"),
			endsAt: new Date("2026-07-14T13:00:00.000Z"),
		};
		expect(
			timeRangesOverlap(first, {
				startsAt: new Date("2026-07-14T13:00:00.000Z"),
				endsAt: new Date("2026-07-14T14:00:00.000Z"),
			}),
		).toBe(false);
		expect(
			timeRangesOverlap(first, {
				startsAt: new Date("2026-07-14T12:59:00.000Z"),
				endsAt: new Date("2026-07-14T14:00:00.000Z"),
			}),
		).toBe(true);
	});
});

describe("approval and billing", () => {
	it("locks entries through review and invoice attachment with recovery paths", () => {
		expect(canTransitionTimeEntry("running", "draft")).toBe(true);
		expect(canTransitionTimeEntry("draft", "approved")).toBe(true);
		expect(canTransitionTimeEntry("approved", "invoiced")).toBe(true);
		expect(canTransitionTimeEntry("invoiced", "approved")).toBe(true);
		expect(canTransitionTimeEntry("void", "draft")).toBe(true);
		expect(canTransitionTimeEntry("draft", "invoiced")).toBe(false);
	});

	it("supports exact, nearest, upward, and downward billing increments", () => {
		expect(roundBillableSeconds(61, 1, "none")).toBe(61);
		expect(roundBillableSeconds(61, 1, "nearest")).toBe(60);
		expect(roundBillableSeconds(61, 1, "up")).toBe(120);
		expect(roundBillableSeconds(61, 1, "down")).toBe(60);
		expect(calculateTimeAmountCents(5_400, 10_000)).toBe(15_000);
	});
});
