export const API_HEADERS = {
	apiKey: "Authorization",
	/**
	 * An END CUSTOMER's session token.
	 *
	 * 🔴 Its own header, never `Authorization`. Operator credentials arrive as a
	 * bearer token there, and a customer token sharing that channel would mean
	 * one middleware bug away from a shopper's session satisfying an operator
	 * route. Different header, different middleware, no overlap.
	 */
	customerSession: "QuickEngine-Customer-Session",
	idempotencyKey: "Idempotency-Key",
	idempotencyReplayed: "Idempotency-Replayed",
	publishableKey: "QuickEngine-Publishable-Key",
	requestId: "X-Request-Id",
	workspace: "QuickEngine-Workspace",
} as const;

export const RATE_LIMIT_HEADERS = {
	limit: "RateLimit-Limit",
	remaining: "RateLimit-Remaining",
	reset: "RateLimit-Reset",
	retryAfter: "Retry-After",
} as const;
