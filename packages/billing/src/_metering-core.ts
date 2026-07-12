import { METER_KIND, type MeterKey } from "./plans";

// Pure metering logic — no DB, no env. Kept dependency-free so the limit math,
// period windows, and grace policy can be unit-tested in isolation.

export type LimitState = "ok" | "warn" | "over";

export type LimitCheck = {
	meter: MeterKey;
	used: number;
	/** null = unlimited. */
	limit: number | null;
	/** null when unlimited. */
	remaining: number | null;
	exceeded: boolean;
	state: LimitState;
};

/** Warn once usage crosses this fraction of the limit. */
export const WARN_AT = 0.8;
/** Overage grace: new work is allowed until usage passes (1 + GRACE) × limit. */
export const GRACE = 0.1;

// Gauges have no billing period, so they all share this fixed all-time window.
export const SENTINEL_PERIOD = { start: new Date(0), end: new Date(0) };

// The calendar-month (UTC) window that action counters reset on. Anchoring this
// to the subscription's billing day instead is a later refinement (see the design
// doc); a calendar reset is simpler, predictable, and easy to reason about.
export function counterPeriod(now: Date = new Date()): {
	start: Date;
	end: Date;
} {
	return {
		start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
		end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
	};
}

/** The usage window for a meter: monthly for counters, all-time for gauges. */
export function periodFor(
	meter: MeterKey,
	now: Date = new Date(),
): { start: Date; end: Date } {
	return METER_KIND[meter] === "counter" ? counterPeriod(now) : SENTINEL_PERIOD;
}

/** Evaluate usage against a limit. `limit === null` = unlimited. */
export function evaluate(
	meter: MeterKey,
	limit: number | null,
	used: number,
): LimitCheck {
	if (limit === null) {
		return {
			meter,
			used,
			limit: null,
			remaining: null,
			exceeded: false,
			state: "ok",
		};
	}
	const remaining = Math.max(0, limit - used);
	// A zero limit means "none allowed" — treat any use as fully consumed.
	const ratio = limit <= 0 ? 1 : used / limit;
	const state: LimitState =
		ratio >= 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok";
	return { meter, used, limit, remaining, exceeded: used >= limit, state };
}

/** Whether NEW work may start: allowed until usage passes the grace ceiling. */
export function withinGrace(
	limit: number | null,
	used: number,
	grace: number = GRACE,
): boolean {
	if (limit === null) {
		return true;
	}
	return used < limit * (1 + grace);
}
