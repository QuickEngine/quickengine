import { DomainError } from "@quickengine/api-contracts/errors";
import { z } from "zod";
import { type ReportRangeInput, reportRangeInputSchema } from "./range";
import { getWorkspaceReport } from "./reports";
import { getRevenueSeries, getTrafficSeries } from "./series";
import { getTrafficSummary, recordTrafficEvent } from "./traffic";

/**
 * Reporting is the one module with no durable command layer, and deliberately so.
 *
 * Fourteen modules own business writes that must replay safely and leave audit evidence. This one
 * owns **queries** plus a single high-volume telemetry write. Traffic events are already idempotent
 * on `eventId`; routing them through a unit of work would add three rows and an advisory lock per
 * page view and fill the audit trail with records that mean nothing to a business. See
 * `internal/STATE.md` → "recordTrafficEvent gets NO durable command".
 */

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	REPORTING_ANALYTICS_NOT_ENABLED:
		"Reporting & Analytics isn't enabled for this workspace.",
	TRAFFIC_EVENT_IN_FUTURE: "That event is dated in the future.",
	TRAFFIC_EVENT_TOO_OLD: "That event is too old to record.",
};

export function mapReportingError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/NOT_ENABLED/.test(error.message)) {
			throw new DomainError("MODULE_DISABLED", message);
		}
		if (/(IN_FUTURE|TOO_OLD)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
	}
	throw error;
}

/**
 * Parse a report range from query-string values.
 *
 * The module's own schema takes `Date`s; over HTTP everything arrives as a string, and a bad date
 * must fail as a validation error rather than reaching the query layer as `Invalid Date`.
 * `from`/`to` default to the last 30 days so a caller can ask for a report with no arguments.
 */
export const reportRangeQuerySchema = z
	.object({
		from: z.coerce.date().optional(),
		to: z.coerce.date().optional(),
		timeZone: z.string().trim().default("UTC"),
		granularity: z.enum(["day", "week", "month"]).default("day"),
	})
	.transform((value) => {
		const to = value.to ?? new Date();
		const from = value.from ?? new Date(to.getTime() - 30 * 86_400_000);
		return { ...value, from, to } satisfies ReportRangeInput;
	});

/**
 * The shape a caller actually has: HTTP query strings, all `string | undefined`. Deliberately
 * looser than the schema's input type so a route can hand raw query values straight in and let
 * `parseRange` do the validating and reporting.
 */
export type ReportRangeQuery = {
	from?: unknown;
	to?: unknown;
	timeZone?: string;
	granularity?: string;
};

/**
 * Validate once, here. The query schema coerces strings to dates; the module's own schema owns the
 * real rules (end after start, <= 366 days, valid IANA zone). Running both in this layer means a
 * caller always gets a `DomainError`, never a raw `ZodError` leaking from the query internals.
 */
const parseRange = (query: ReportRangeQuery) => {
	try {
		return reportRangeInputSchema.parse(reportRangeQuerySchema.parse(query));
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new DomainError(
				"VALIDATION_ERROR",
				"Check the report's date range, time zone, and granularity.",
				error.issues,
			);
		}
		throw error;
	}
};

/** Cross-module snapshot. Sections a workspace hasn't enabled come back unavailable, never faked. */
export async function getWorkspaceReportDto(
	workspaceId: string,
	query: ReportRangeQuery,
) {
	return getWorkspaceReport(workspaceId, parseRange(query)).catch(
		mapReportingError,
	);
}

export async function getRevenueSeriesDto(
	workspaceId: string,
	query: ReportRangeQuery,
) {
	return getRevenueSeries(workspaceId, parseRange(query)).catch(
		mapReportingError,
	);
}

export async function getTrafficSeriesDto(
	workspaceId: string,
	query: ReportRangeQuery,
) {
	return getTrafficSeries(workspaceId, parseRange(query)).catch(
		mapReportingError,
	);
}

export async function getTrafficSummaryDto(
	workspaceId: string,
	query: ReportRangeQuery,
) {
	return getTrafficSummary(workspaceId, parseRange(query)).catch(
		mapReportingError,
	);
}

/**
 * Record one self-reported traffic event.
 *
 * Not a durable command by design (see the note above). Idempotent on `eventId`: a repeat returns
 * `accepted: false` rather than failing, so a site retrying a beacon is harmless. Visitor and
 * session ids are hashed server-side with a per-workspace salt before storage — raw ids never land.
 */
export async function recordTrafficEventDto(
	workspaceId: string,
	input: Parameters<typeof recordTrafficEvent>[1],
	options: { now?: Date } = {},
) {
	return recordTrafficEvent(workspaceId, input, options).catch(
		mapReportingError,
	);
}
