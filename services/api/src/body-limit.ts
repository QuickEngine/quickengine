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

/** Counts the actual streamed bytes; Content-Length is only an early rejection hint. */
export function createBodyLimit(maxBytes: number) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		if (SAFE_METHODS.has(c.req.method) || !c.req.raw.body) return next();

		const declared = Number(c.req.header("Content-Length"));
		if (Number.isFinite(declared) && declared > maxBytes) return tooLarge(c);

		const reader = c.req.raw.body.getReader();
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) {
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
