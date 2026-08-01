import {
	attributionFrom,
	PRODUCT_EVENTS,
	trackProductEvent,
} from "@quickengine/analytics";
import type { CacheProvider } from "@quickengine/cache";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeSession } from "./authorize-account";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond } from "./respond";

/**
 * The events only a browser can see.
 *
 * Server-side moments are recorded where they happen — a signup at the auth
 * hook, an activation where the checklist completes. But nobody can observe from
 * the server that a person *reached* the signup page, or *abandoned* onboarding
 * at step two, and those are the most valuable failure signals there are.
 *
 * 🔴 **The event name is validated against the contract.** Free-text names would
 * let a typo silently create `signup.complete`, splitting a funnel in half with
 * nothing to indicate it happened, and would let a caller invent an event that
 * carries meaning nobody agreed.
 *
 * 🔴 **`userId` is taken from the SESSION, never from the body.** A client that
 * could name the person it is reporting on could write events attributed to
 * anybody, which would corrupt every per-person number and make retention a
 * fiction.
 *
 * ⚠️ Properties still pass through `stripUnsafe` inside `trackProductEvent`, so
 * a browser cannot post record contents into telemetry even by accident.
 */
const eventSchema = z.object({
	// The names are a const object, so this stays in step with the contract by
	// construction rather than by somebody remembering to update it.
	name: z.enum(
		Object.keys(PRODUCT_EVENTS) as [string, ...string[]],
	) as unknown as z.ZodType<keyof typeof PRODUCT_EVENTS>,
	surface: z.enum(["web", "auth", "account", "quickdash"]),
	workspaceId: z.uuid().optional(),
	properties: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.optional(),
	/**
	 * Campaign attribution, for `signup.viewed`. Accepted loosely and filtered by
	 * `attributionFrom`, so a client sending the whole query string is harmless.
	 */
	attribution: z.record(z.string(), z.unknown()).optional(),
});

export function registerProductEventRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const session = authorizeSession(options.platform);
	// Telemetry policy rather than write: these are frequent, tiny, and refusing
	// one costs a data point rather than a customer's work.
	const limit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.telemetry,
		scope: "product-events.write",
	});

	app.post("/v1/product-events", session, limit, async (c) => {
		const input = eventSchema.parse(await c.req.json());
		const account = c.get("account");

		// Attribution is allowlisted rather than passed through: a browser sends
		// whatever is in the query string, and only these four keys are dimensions.
		// Merged after the caller's own properties so it cannot be overwritten.
		const properties = {
			...input.properties,
			...attributionFrom(input.attribution),
		};

		trackProductEvent({
			name: input.name,
			surface: input.surface,
			// Session, never the body. See the note above.
			userId: account.userId,
			organizationId: account.organizationId,
			workspaceId: input.workspaceId ?? null,
			properties,
		});

		// 202: it was accepted, and it has not necessarily been written. Telemetry
		// is fire-and-forget by design, and reporting 201 would claim otherwise.
		return respond(c, { accepted: true }, 202);
	});
}
