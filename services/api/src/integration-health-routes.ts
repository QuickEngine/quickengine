import type { CacheProvider } from "@quickengine/cache";
import {
	getRequestTrace,
	getSupportBundle,
	listRecentRequests,
} from "@quickengine/db";
import { getDegradedProviders } from "@quickengine/provider-health";
import type { Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * What is degraded right now, for the workspace's Connect page.
 *
 * 🔑 Why this exists. A provider falling back to its no-op stand-in is invisible
 * from the outside: search returns nothing, which reads as "you have no records"
 * rather than "search is not configured". That is the most misleading failure
 * mode a product can have, and until now the only place it was reported was the
 * server log — where the customer cannot see it and the person debugging their
 * integration at 3am never looks.
 *
 * **Authorized, not public.** The payload names internal capabilities and the
 * environment variables that would fix them. That is the right level of detail
 * for someone wiring up an integration and the wrong level for the open
 * internet, so it sits behind the same workspace authorization as the rest of
 * Connect.
 *
 * ⚠️ **Names only, never values.** `ProviderDegradation.missing` is documented as
 * variable NAMES because the string reaches logs. It reaches an HTTP response
 * now as well, so that contract matters more, not less. Nothing here reads
 * `process.env`; it only forwards what the health registry already recorded.
 *
 * This is a read of in-process state, not a probe. It reports what selection
 * *chose* at boot, so it costs nothing and cannot itself fail.
 */
export function registerIntegrationHealthRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "webhooks:read",
		sessionCapability: "workspace.view",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "integration-health.read",
	});

	/**
	 * What happened under one request id.
	 *
	 * Lives beside integration health because they are one surface to a customer:
	 * "my integration is misbehaving, here is the id it gave me." Same
	 * authorization, same rate policy.
	 */
	/**
	 * The developer console's stream: what this workspace changed, newest first.
	 *
	 * 🔑 A LIST, where only single-lookup existed. `/requests/:requestId` answers
	 * "what did this one do", which is right when an error hands you an id and
	 * useless when you are watching your own integration run.
	 */
	app.get("/v1/requests", readAccess, readLimit, async (c) =>
		respond(c, {
			items: await listRecentRequests(c.get("authorized").workspaceId, {
				limit: Number(c.req.query("limit") ?? 50),
				failuresOnly: c.req.query("failures") === "true",
			}),
		}),
	);

	app.get("/v1/requests/:requestId", readAccess, readLimit, async (c) =>
		respond(
			c,
			await getRequestTrace(
				c.get("authorized").workspaceId,
				c.req.param("requestId"),
			),
		),
	);

	/**
	 * A diagnostic snapshot to attach to a support request.
	 *
	 * Built by allowlist in the data layer — see `support-bundle.ts`. Nothing
	 * here filters or redacts, because a route that had to strip fields would be
	 * the wrong place to get it right.
	 */
	app.get("/v1/support-bundle", readAccess, readLimit, async (c) => {
		const bundle = await getSupportBundle(c.get("authorized").workspaceId);
		if (!bundle) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		return respond(c, bundle);
	});

	app.get("/v1/integration-health", readAccess, readLimit, (c) => {
		const degraded = getDegradedProviders();
		return respond(c, {
			// `healthy` rather than making the caller derive it from an empty array:
			// the common case is "everything is fine" and that should be one field to
			// read, not an inference.
			healthy: degraded.length === 0,
			// `data-loss` means work is accepted and then silently discarded. A caller
			// that shows a single "degraded" badge for both would hide the difference
			// that actually matters.
			severity: degraded.some((entry) => entry.severity === "data-loss")
				? "data-loss"
				: degraded.length > 0
					? "feature-loss"
					: "healthy",
			providers: degraded.map((entry) => ({
				provider: entry.provider,
				implementation: entry.implementation,
				consequence: entry.consequence,
				missing: entry.missing,
				severity: entry.severity,
			})),
		});
	});
}
