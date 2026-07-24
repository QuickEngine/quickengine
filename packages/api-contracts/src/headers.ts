export const API_HEADERS = {
	apiKey: "Authorization",
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
