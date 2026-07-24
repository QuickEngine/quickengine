import type { QuickClient } from "../client";
import type {
	QuickReportRange,
	QuickResponse,
	QuickRevenueSeries,
	QuickSeriesPoint,
	QuickTrafficSummary,
	QuickWorkspaceReport,
} from "../types";

/**
 * Typed client for a workspace's reports. Reached as `quick.reports`.
 *
 * Reads only — recording traffic lives on `quick.events`, because reporting *reads* are business
 * data (secret keys and sessions) while traffic *ingest* is the one write a public website may make.
 *
 * Every range defaults to the last 30 days, so any call works with no arguments. Money is always
 * reported per currency and never summed across them.
 */
export class ReportsResource {
	constructor(private readonly client: QuickClient) {}

	private query(range: QuickReportRange = {}) {
		const query = new URLSearchParams();
		const iso = (value: Date | string) =>
			value instanceof Date ? value.toISOString() : value;
		if (range.from) query.set("from", iso(range.from));
		if (range.to) query.set("to", iso(range.to));
		if (range.timeZone) query.set("timeZone", range.timeZone);
		if (range.granularity) query.set("granularity", range.granularity);
		return query.size ? `?${query}` : "";
	}

	/**
	 * Cross-module snapshot. Sections for modules the workspace hasn't enabled come back
	 * `available: false` rather than zeroed — check `available` before reading `data`.
	 */
	workspace(
		range: QuickReportRange = {},
	): Promise<QuickResponse<QuickWorkspaceReport>> {
		return this.client.request(`/reports/workspace${this.query(range)}`);
	}

	/** Collected and refunded revenue over time, split by currency. */
	revenue(
		range: QuickReportRange = {},
	): Promise<QuickResponse<QuickRevenueSeries>> {
		return this.client.request(`/reports/revenue${this.query(range)}`);
	}

	/** Self-reported site traffic bucketed over the range. */
	traffic(
		range: QuickReportRange = {},
	): Promise<QuickResponse<QuickSeriesPoint[]>> {
		return this.client.request(`/reports/traffic${this.query(range)}`);
	}

	trafficSummary(
		range: QuickReportRange = {},
	): Promise<QuickResponse<QuickTrafficSummary>> {
		return this.client.request(`/reports/traffic/summary${this.query(range)}`);
	}
}
