import {
	type ApiErrorCode,
	RATE_LIMIT_HEADERS,
} from "@quickengine/api-contracts";
import type { CacheProvider } from "@quickengine/cache";
import { createMiddleware } from "hono/factory";
import type { ApiLogger } from "./logger";
import type { AuthorizedApiContext, PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

export type RateLimitPolicy = {
	failureMode: "closed" | "open";
	limit: number;
	windowSeconds: number;
};

export const RATE_LIMIT_POLICIES = {
	read: { failureMode: "open", limit: 600, windowSeconds: 60 },
	telemetry: { failureMode: "closed", limit: 300, windowSeconds: 60 },
	write: { failureMode: "closed", limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * How much of the base policy each plan gets.
 *
 * **A multiplier rather than a policy per plan.** Three scopes across five plans
 * would be fifteen hand-maintained numbers that drift apart the moment one is
 * tuned; this keeps the *shape* of each policy in one place and scales it.
 *
 * **Rate limits are not usage limits.** This bounds how fast an account may go
 * right now — a burst, a runaway loop, a scraper — and retrying shortly works.
 * Spending a monthly allowance is a different thing entirely, answers 402, and
 * retrying never helps. Conflating them sends people to add backoff for a problem
 * only an upgrade fixes.
 *
 * Free is deliberately tight because that is where abuse lands, and paid tiers are
 * loose enough that a real storefront never notices.
 */
export const PLAN_RATE_MULTIPLIER: Record<string, number> = {
	free: 0.25,
	launch: 1,
	grow: 2,
	scale: 4,
};

/** Falls back to the base policy when the plan is unknown or unresolved. */
export function policyForPlan(
	policy: RateLimitPolicy,
	planId: string | undefined,
): RateLimitPolicy {
	const multiplier = planId ? PLAN_RATE_MULTIPLIER[planId] : undefined;
	if (multiplier === undefined || multiplier === 1) return policy;
	// At least 1, so a small multiplier can never round a tier down to zero and
	// lock an account out of its own API.
	return {
		...policy,
		limit: Math.max(1, Math.round(policy.limit * multiplier)),
	};
}

function principalSubject(context: AuthorizedApiContext): string {
	return context.principal.kind === "key"
		? `key:${context.principal.keyId}`
		: `user:${context.principal.userId}`;
}

function writeHeaders(
	response: Response,
	policy: RateLimitPolicy,
	count: number,
	resetSeconds: number,
) {
	response.headers.set(RATE_LIMIT_HEADERS.limit, String(policy.limit));
	response.headers.set(
		RATE_LIMIT_HEADERS.remaining,
		String(Math.max(0, policy.limit - count)),
	);
	response.headers.set(RATE_LIMIT_HEADERS.reset, String(resetSeconds));
}

/** Must be registered after authorization so budgets are tenant/principal scoped. */
export function createRateLimit(options: {
	cache: CacheProvider;
	logger: ApiLogger;
	now?: () => number;
	policy: RateLimitPolicy;
	scope: string;
}) {
	const now = options.now ?? Date.now;
	return createMiddleware<PlatformEnv>(async (c, next) => {
		const authorized = c.get("authorized");
		// Set during usage enforcement, which resolves the plan anyway. Absent
		// outside production, where enforcement is off — the base policy applies.
		const policy = policyForPlan(options.policy, c.get("planId"));
		const epochSeconds = Math.floor(now() / 1000);
		const window = Math.floor(epochSeconds / policy.windowSeconds);
		const key = [
			"ratelimit",
			authorized.workspaceId,
			principalSubject(authorized),
			options.scope,
			window,
		].join(":");

		let count: number;
		try {
			count = await options.cache.increment(key, policy.windowSeconds);
		} catch (error) {
			options.logger.warn("rate_limit.unavailable", {
				error,
				failureMode: policy.failureMode,
				scope: options.scope,
				workspaceId: authorized.workspaceId,
			});
			if (policy.failureMode === "open") return next();
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"A required request-control dependency is unavailable.",
				503,
			);
		}

		const resetSeconds = Math.max(
			1,
			(window + 1) * policy.windowSeconds - epochSeconds,
		);
		if (count > policy.limit) {
			const response = respondError(
				c,
				"RATE_LIMITED" satisfies ApiErrorCode,
				"Too many requests. Slow down and retry shortly.",
				429,
			);
			writeHeaders(response, options.policy, count, resetSeconds);
			response.headers.set(RATE_LIMIT_HEADERS.retryAfter, String(resetSeconds));
			return response;
		}

		await next();
		writeHeaders(c.res, options.policy, count, resetSeconds);
	});
}
