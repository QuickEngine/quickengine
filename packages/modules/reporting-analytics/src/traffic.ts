import { createHash } from "node:crypto";
import {
	and,
	db,
	eq,
	gte,
	lt,
	quickengineWorkspaces,
	reportingTrafficEvents,
	sql,
	workspaceModules,
} from "@quickengine/db";
import { z } from "zod";
import { type ReportRangeInput, reportRangeInputSchema } from "./range";

export const trafficEventInputSchema = z.object({
	eventId: z.string().trim().min(8).max(200),
	siteKey: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
	visitorId: z.string().min(8).max(500),
	sessionId: z.string().min(8).max(500),
	path: z
		.string()
		.trim()
		.min(1)
		.max(2_000)
		.startsWith("/")
		.refine(
			(value) => !value.includes("?"),
			"Path must not contain query data",
		),
	referrerHost: z
		.string()
		.trim()
		.toLowerCase()
		.max(255)
		.nullable()
		.default(null),
	occurredAt: z.date(),
});

function privacyHash(workspaceId: string, kind: string, value: string): string {
	return createHash("sha256")
		.update(`${workspaceId}\0${kind}\0${value}`)
		.digest("hex");
}

export async function recordTrafficEvent(
	workspaceId: string,
	input: z.input<typeof trafficEventInputSchema>,
	options: { now?: Date } = {},
) {
	const parsed = trafficEventInputSchema.parse(input);
	const now = options.now ?? new Date();
	if (parsed.occurredAt > new Date(now.getTime() + 5 * 60_000)) {
		throw new Error("TRAFFIC_EVENT_IN_FUTURE");
	}
	if (parsed.occurredAt < new Date(now.getTime() - 7 * 86_400_000)) {
		throw new Error("TRAFFIC_EVENT_TOO_OLD");
	}
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	const [enabled] = await db
		.select({ enabled: workspaceModules.enabled })
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.moduleId, "reporting-analytics"),
				eq(workspaceModules.enabled, true),
			),
		)
		.limit(1);
	if (!enabled) throw new Error("REPORTING_ANALYTICS_NOT_ENABLED");
	const [event] = await db
		.insert(reportingTrafficEvents)
		.values({
			workspaceId,
			eventId: parsed.eventId,
			siteKey: parsed.siteKey,
			visitorHash: privacyHash(workspaceId, "visitor", parsed.visitorId),
			sessionHash: privacyHash(workspaceId, "session", parsed.sessionId),
			path: parsed.path,
			referrerHost: parsed.referrerHost,
			occurredAt: parsed.occurredAt,
			receivedAt: now,
		})
		.onConflictDoNothing({
			target: [
				reportingTrafficEvents.workspaceId,
				reportingTrafficEvents.eventId,
			],
		})
		.returning();
	return { accepted: Boolean(event), eventId: parsed.eventId };
}

export async function getTrafficSummary(
	workspaceId: string,
	input: ReportRangeInput,
) {
	const range = reportRangeInputSchema.parse(input);
	const [summary] = await db
		.select({
			pageViews: sql<number>`count(*)::int`,
			visitors: sql<number>`count(distinct ${reportingTrafficEvents.visitorHash})::int`,
			sessions: sql<number>`count(distinct ${reportingTrafficEvents.sessionHash})::int`,
		})
		.from(reportingTrafficEvents)
		.where(
			and(
				eq(reportingTrafficEvents.workspaceId, workspaceId),
				gte(reportingTrafficEvents.occurredAt, range.from),
				lt(reportingTrafficEvents.occurredAt, range.to),
			),
		);
	return summary ?? { pageViews: 0, visitors: 0, sessions: 0 };
}
