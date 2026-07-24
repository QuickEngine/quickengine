import type { CacheProvider } from "@quickengine/cache";
import {
	getRevenueSeriesDto,
	getTrafficSeriesDto,
	getTrafficSummaryDto,
	getWorkspaceReportDto,
	recordTrafficEventDto,
} from "@quickengine/mod-reporting-analytics";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond } from "./respond";

/**
 * A traffic event a site reports about itself. `visitorId`/`sessionId` are opaque ids the caller
 * generates; the module hashes them server-side with a per-workspace salt, so raw ids are never
 * stored. `path` carries no query string so a URL can't smuggle personal data into analytics.
 */
const trafficEventBodySchema = z.object({
	eventId: z.string().trim().min(8).max(200),
	siteKey: z.string().trim().min(1).max(100),
	visitorId: z.string().min(8).max(500),
	sessionId: z.string().min(8).max(500),
	path: z.string().trim().min(1).max(2_000),
	referrerHost: z.string().trim().max(255).nullable().optional(),
	occurredAt: z.coerce.date(),
});

export function registerReportingRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	/**
	 * Reports are business data, so `analytics:read` is secret/session only — never publishable.
	 * Traffic ingest keeps `events:write`, which IS website-safe: a public site reporting its own
	 * page views is the one write a publishable key may perform.
	 */
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "analytics:read",
		module: "reporting-analytics",
		sessionCapability: "workspace.view",
	});
	const ingestAccess = authorizeWorkspace(options.platform, {
		keyCapability: "events:write",
		module: "reporting-analytics",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "reports.read",
	});
	// Page views arrive far more often than ordinary writes, so ingest gets the telemetry budget.
	const ingestLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.telemetry,
		scope: "events.write",
	});

	const range = (c: Context<PlatformEnv>) => ({
		from: c.req.query("from"),
		granularity: c.req.query("granularity"),
		timeZone: c.req.query("timeZone"),
		to: c.req.query("to"),
	});

	/**
	 * Cross-module snapshot. Sections for modules a workspace hasn't enabled come back
	 * `available: false` rather than zeroes, so a caller can tell "nothing happened" apart from
	 * "this isn't switched on".
	 */
	app.get("/v1/reports/workspace", readAccess, readLimit, async (c) =>
		respond(
			c,
			await getWorkspaceReportDto(c.get("authorized").workspaceId, range(c)),
		),
	);
	app.get("/v1/reports/revenue", readAccess, readLimit, async (c) =>
		respond(
			c,
			await getRevenueSeriesDto(c.get("authorized").workspaceId, range(c)),
		),
	);
	app.get("/v1/reports/traffic", readAccess, readLimit, async (c) =>
		respond(
			c,
			await getTrafficSeriesDto(c.get("authorized").workspaceId, range(c)),
		),
	);
	app.get("/v1/reports/traffic/summary", readAccess, readLimit, async (c) =>
		respond(
			c,
			await getTrafficSummaryDto(c.get("authorized").workspaceId, range(c)),
		),
	);

	/**
	 * Ingest one traffic event. Deliberately **not** a durable mutation: it is high-volume
	 * telemetry, already idempotent on `eventId`, and routing every page view through a unit of
	 * work would triple the writes and fill the audit trail with records of no business meaning.
	 * A duplicate returns `accepted: false` rather than an error, so a retried beacon is harmless —
	 * which is also why this route requires no `Idempotency-Key`.
	 */
	app.post("/v1/events", ingestAccess, ingestLimit, async (c) => {
		const body = trafficEventBodySchema.parse(await c.req.json());
		return respond(
			c,
			await recordTrafficEventDto(c.get("authorized").workspaceId, {
				...body,
				referrerHost: body.referrerHost ?? null,
			}),
		);
	});
}
