import { createMiddleware } from "hono/factory";
import type { PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function tooLarge(
	c: Parameters<ReturnType<typeof createMiddleware<PlatformEnv>>>[0],
) {
	return respondError(
		c,
		"PAYLOAD_TOO_LARGE",
		"The request body exceeds the allowed size.",
		413,
	);
}

/**
 * Routes that carry a FILE, and therefore cannot live under the JSON limit.
 *
 * 🔴 The default body limit is 1 MiB, which is right for JSON and hopeless for
 * a photograph — every picture off a phone is several megabytes. The image
 * route advertises a 10 MB maximum and validates against it, but the middleware
 * refused the request first, so uploading any real product photo failed before
 * the route ever ran and the 10 MB promise was unreachable.
 *
 * ⚠️ An ALLOWLIST, not a blanket raise. Letting every route accept 12 MB would
 * hand an attacker a cheap way to tie up memory on any JSON endpoint, since
 * this middleware buffers the body to count it.
 */
const UPLOAD_PATHS = [
	/^\/v1\/quickdash\/catalog\/[^/]+\/images$/,
	/^\/v1\/files/,
];

/** Headroom over the route's own 10 MB check, for multipart framing overhead. */
const UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

/** Counts the actual streamed bytes; Content-Length is only an early rejection hint. */
export function createBodyLimit(maxBytes: number) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		if (SAFE_METHODS.has(c.req.method) || !c.req.raw.body) return next();

		// The route still enforces its own, stricter limit on the decoded file, so
		// this only decides how much is worth reading.
		const path = new URL(c.req.url).pathname;
		const limit = UPLOAD_PATHS.some((pattern) => pattern.test(path))
			? Math.max(maxBytes, UPLOAD_MAX_BYTES)
			: maxBytes;

		const declared = Number(c.req.header("Content-Length"));
		if (Number.isFinite(declared) && declared > limit) return tooLarge(c);

		const reader = c.req.raw.body.getReader();
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > limit) {
				await reader.cancel();
				return tooLarge(c);
			}
			chunks.push(value);
		}

		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			},
		});
		c.req.raw = new Request(c.req.raw, {
			body,
			duplex: "half",
		} as RequestInit & { duplex: "half" });
		return next();
	});
}
