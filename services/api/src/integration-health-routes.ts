import type { CacheProvider } from "@quickengine/cache";
import { getDegradedProviders } from "@quickengine/provider-health";
import type { Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond } from "./respond";

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
