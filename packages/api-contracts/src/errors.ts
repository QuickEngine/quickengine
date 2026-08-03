import { z } from "zod";

export const API_ERROR_CODES = [
	"AUTHENTICATION_REQUIRED",
	"INVALID_API_KEY",
	"CREDENTIAL_CHANNEL_MISMATCH",
	// Customer boundary (`/v1/customer/*`) — our users' users.
	"PUBLISHABLE_KEY_REQUIRED",
	"SESSION_EXPIRED",
	"SESSION_WORKSPACE_MISMATCH",
	"PORTAL_NOT_FOUND",
	"WORKSPACE_REQUIRED",
	"WORKSPACE_MISMATCH",
	"WORKSPACE_NOT_FOUND",
	"CAPABILITY_DENIED",
	"MODULE_DISABLED",
	"CSRF_REJECTED",
	"VALIDATION_ERROR",
	"PAYLOAD_TOO_LARGE",
	"REQUEST_TIMEOUT",
	"RATE_LIMITED",
	"USAGE_LIMIT_EXCEEDED",
	"IDEMPOTENCY_REQUIRED",
	"IDEMPOTENCY_CONFLICT",
	"IDEMPOTENCY_IN_PROGRESS",
	"DEPENDENCY_UNAVAILABLE",
	"NOT_FOUND",
	"CONFLICT",
	"INTERNAL_ERROR",
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
	AUTHENTICATION_REQUIRED: 401,
	INVALID_API_KEY: 401,
	CREDENTIAL_CHANNEL_MISMATCH: 401,
	PUBLISHABLE_KEY_REQUIRED: 401,
	// 401, not 403. The session is gone, not forbidden — signing in again fixes
	// it, and a client that treats it as 403 will show "access denied" to someone
	// who simply needs to log back in.
	SESSION_EXPIRED: 401,
	// 403, not 401. Signing in again would NOT fix this: the session is valid,
	// just for somebody else's storefront. Answering 401 would send a client into
	// a re-authentication loop it can never win.
	SESSION_WORKSPACE_MISMATCH: 403,
	// 404 for an unknown slug AND for a portal that exists but is switched off.
	// Distinguishing them would let anyone walk the namespace to inventory which
	// businesses are on the platform.
	PORTAL_NOT_FOUND: 404,
	WORKSPACE_REQUIRED: 400,
	WORKSPACE_MISMATCH: 403,
	WORKSPACE_NOT_FOUND: 404,
	CAPABILITY_DENIED: 403,
	MODULE_DISABLED: 403,
	CSRF_REJECTED: 403,
	VALIDATION_ERROR: 400,
	PAYLOAD_TOO_LARGE: 413,
	REQUEST_TIMEOUT: 504,
	RATE_LIMITED: 429,
	// 402, not 429. Rate limiting says "slow down"; this says "your plan's included
	// usage is spent." Retrying does not help, and conflating the two sends people
	// to add backoff for a problem only an upgrade or a top-up resolves.
	USAGE_LIMIT_EXCEEDED: 402,
	IDEMPOTENCY_REQUIRED: 400,
	IDEMPOTENCY_CONFLICT: 409,
	IDEMPOTENCY_IN_PROGRESS: 409,
	DEPENDENCY_UNAVAILABLE: 503,
	NOT_FOUND: 404,
	CONFLICT: 409,
	INTERNAL_ERROR: 500,
};

/**
 * A business-rule failure a module command raises for the HTTP boundary to translate into a
 * stable API error. Modules throw this instead of a bare `Error("CODE")` so every vertical maps
 * domain outcomes (conflicts, illegal transitions, missing records) to one consistent envelope.
 */
export class DomainError extends Error {
	readonly code: ApiErrorCode;
	readonly status: number;
	readonly details?: unknown;

	constructor(code: ApiErrorCode, message: string, details?: unknown) {
		super(message);
		this.name = "DomainError";
		this.code = code;
		this.status = API_ERROR_STATUS[code];
		this.details = details;
	}
}

export const apiErrorSchema = z.object({
	code: apiErrorCodeSchema,
	message: z.string(),
	requestId: z.string().min(1),
	details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
