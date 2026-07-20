import { getCacheProvider } from "@quickengine/cache";
import type { NextResponse } from "next/server";
import type { ApiPrincipal } from "./context";
import { fail } from "./respond";

/**
 * Fixed-window rate limiting for the public v1 API.
 *
 * Built on the cache provider's atomic `increment`, not get/set: read-then-write is a race,
 * so two concurrent requests both read 4, both write 5, and a limit of 5 admits 6. In
 * production the counter lives in Redis, so it aggregates across serverless invocations —
 * an in-process counter would reset on every cold start and limit nothing.
 *
 * Fixed window rather than sliding: it costs one INCR per request instead of a sorted-set
 * read/write, and its worst case (a burst straddling a window boundary admitting up to 2x
 * the limit briefly) is acceptable for abuse protection. A sliding window is worth the cost
 * only for hard quotas, which these are not.
 */
export type RateLimit = {
	/** Requests permitted per window. */
	limit: number;
	/** Window length in seconds. */
	windowSeconds: number;
};

/**
 * Writes are far cheaper to abuse than reads, and `POST /api/v1/events` accepts a
 * publishable key — a credential deliberately shipped in browser code, so its value is
 * public by design. It gets the tightest budget.
 */
export const RATE_LIMITS = {
	read: { limit: 600, windowSeconds: 60 },
	write: { limit: 120, windowSeconds: 60 },
	telemetry: { limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimit>;

/**
 * The identity a budget belongs to.
 *
 * Keyed on the API key (or user) rather than IP wherever possible, so one workspace's
 * traffic can never exhaust another's — and so a single customer behind a shared NAT is not
 * throttled by their neighbours. IP is the fallback for callers we cannot identify, which on
 * this surface means unauthenticated requests that are about to be rejected anyway.
 */
function subject(principal: ApiPrincipal | null, request: Request): string {
	if (principal?.kind === "key") return `key:${principal.keyId}`;
	if (principal?.kind === "session") return `user:${principal.userId}`;
	// `x-forwarded-for` is client-controlled, but on Vercel the platform overwrites it with
	// the real peer address, so the leftmost entry is trustworthy there.
	const forwarded = request.headers.get("x-forwarded-for");
	const ip = forwarded?.split(",")[0]?.trim();
	return `ip:${ip || "unknown"}`;
}

export type RateLimitResult =
	| { ok: true; headers: Record<string, string> }
	| { ok: false; response: NextResponse };

/**
 * Consume one unit of the caller's budget.
 *
 * **Fails open.** If the cache is unreachable the request is allowed and the failure is
 * logged. For a business backend, an Upstash blip taking the entire API down is a worse
 * outcome than a brief unprotected window — availability beats a short gap in abuse
 * protection. The trade-off is deliberate and should be revisited if the API ever carries
 * something where the reverse is true.
 */
export async function consumeRateLimit(
	request: Request,
	requestId: string,
	limit: RateLimit,
	principal: ApiPrincipal | null,
	scope: string,
): Promise<RateLimitResult> {
	const window = Math.floor(Date.now() / 1000 / limit.windowSeconds);
	const key = `ratelimit:${scope}:${subject(principal, request)}:${window}`;

	let count: number;
	try {
		count = await getCacheProvider().increment(key, limit.windowSeconds);
	} catch (error) {
		console.error("[rate-limit] cache unavailable, allowing request", error);
		return { ok: true, headers: {} };
	}

	const remaining = Math.max(0, limit.limit - count);
	const resetSeconds = (window + 1) * limit.windowSeconds - Date.now() / 1000;
	const retryAfter = Math.max(1, Math.ceil(resetSeconds));
	const headers: Record<string, string> = {
		"RateLimit-Limit": String(limit.limit),
		"RateLimit-Remaining": String(remaining),
		"RateLimit-Reset": String(retryAfter),
	};

	if (count > limit.limit) {
		const response = fail(
			"rate_limited",
			"Too many requests. Slow down and retry shortly.",
			429,
			requestId,
		);
		for (const [name, value] of Object.entries(headers)) {
			response.headers.set(name, value);
		}
		response.headers.set("Retry-After", String(retryAfter));
		return { ok: false, response };
	}

	return { ok: true, headers };
}
