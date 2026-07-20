import { NextResponse } from "next/server";

// The public v1 API envelope, shaped to match what `@quickengine/sdk` already parses:
// success responses carry the resource JSON directly; failures carry `{ code, message,
// details? }`. Every response echoes a `Request-Id` for correlation across logs and the
// eventual audit trail.

/** Read the caller's correlation id, or mint one for this request. */
export function requestId(request: Request): string {
	return request.headers.get("Request-Id")?.trim() || crypto.randomUUID();
}

/**
 * A successful response: the resource JSON is the body; the SDK wraps it as `data`.
 *
 * `headers` carries the caller's remaining rate-limit budget, so a well-behaved client can
 * slow down before it starts getting 429s rather than after.
 */
export function ok(
	data: unknown,
	id: string,
	headers: Record<string, string> = {},
): NextResponse {
	const response = NextResponse.json(data);
	response.headers.set("Request-Id", id);
	for (const [name, value] of Object.entries(headers)) {
		response.headers.set(name, value);
	}
	return response;
}

/** A structured failure the SDK surfaces as a `QuickApiError`. */
export function fail(
	code: string,
	message: string,
	status: number,
	id: string,
	details?: unknown,
): NextResponse {
	const response = NextResponse.json(
		details === undefined ? { code, message } : { code, message, details },
		{ status },
	);
	response.headers.set("Request-Id", id);
	return response;
}
