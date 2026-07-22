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
		const epochSeconds = Math.floor(now() / 1000);
		const window = Math.floor(epochSeconds / options.policy.windowSeconds);
		const key = [
			"ratelimit",
			authorized.workspaceId,
			principalSubject(authorized),
			options.scope,
			window,
		].join(":");

		let count: number;
		try {
			count = await options.cache.increment(key, options.policy.windowSeconds);
		} catch (error) {
			options.logger.warn("rate_limit.unavailable", {
				error,
				failureMode: options.policy.failureMode,
				scope: options.scope,
				workspaceId: authorized.workspaceId,
			});
			if (options.policy.failureMode === "open") return next();
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"A required request-control dependency is unavailable.",
				503,
			);
		}

		const resetSeconds = Math.max(
			1,
			(window + 1) * options.policy.windowSeconds - epochSeconds,
		);
		if (count > options.policy.limit) {
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
