import { recordTrafficEvent } from "@quickengine/mod-reporting-analytics";
import { resolveContext } from "../../_lib/context";
import { RATE_LIMITS } from "../../_lib/rate-limit";
import { fail, ok, requestId } from "../../_lib/respond";

// POST /api/v1/events — ingest one privacy-minimal traffic event a site reports about
// itself (a page view). The first WRITE route, and the first reachable by a publishable
// key's website-safe allowlist. The service does the real work: it hashes the visitor and
// session ids server-side with a per-workspace salt (raw ids are never stored), enforces
// time bounds, and is idempotent on `eventId` (a duplicate returns `accepted: false`).
export async function POST(request: Request): Promise<Response> {
	const id = requestId(request);
	const resolved = await resolveContext(request, id, {
		module: "reporting-analytics",
		capability: "events:write",
		rateLimit: RATE_LIMITS.telemetry,
	});
	if ("error" in resolved) {
		return resolved.error;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return fail("invalid_body", "Request body must be valid JSON.", 400, id);
	}
	if (typeof body !== "object" || body === null) {
		return fail("invalid_body", "Request body must be a JSON object.", 400, id);
	}
	const raw = body as Record<string, unknown>;

	// occurredAt arrives as an ISO string over HTTP; the service expects a Date.
	const occurredAt =
		typeof raw.occurredAt === "string"
			? new Date(raw.occurredAt)
			: new Date(Number.NaN);
	if (Number.isNaN(occurredAt.getTime())) {
		return fail(
			"invalid_body",
			"occurredAt must be an ISO-8601 timestamp.",
			400,
			id,
		);
	}

	try {
		const result = await recordTrafficEvent(resolved.context.workspaceId, {
			eventId: String(raw.eventId ?? ""),
			siteKey: String(raw.siteKey ?? ""),
			visitorId: String(raw.visitorId ?? ""),
			sessionId: String(raw.sessionId ?? ""),
			path: String(raw.path ?? ""),
			referrerHost: raw.referrerHost == null ? null : String(raw.referrerHost),
			occurredAt,
		});
		return ok(result, id, resolved.context.rateLimitHeaders);
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "ZodError") {
				return fail("invalid_event", "The event failed validation.", 400, id);
			}
			if (error.message === "TRAFFIC_EVENT_IN_FUTURE") {
				return fail(
					"event_in_future",
					"occurredAt is too far in the future.",
					422,
					id,
				);
			}
			if (error.message === "TRAFFIC_EVENT_TOO_OLD") {
				return fail(
					"event_too_old",
					"occurredAt is more than 7 days old.",
					422,
					id,
				);
			}
		}
		return fail("internal_error", "The event could not be recorded.", 500, id);
	}
}
