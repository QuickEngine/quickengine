import type { IncomingMessage } from "node:http";

/**
 * Read a Node request body into memory, exactly as it arrived on the wire.
 *
 * **Why this exists.** The Vercel adapter originally attached
 * `Readable.toWeb(req)` as a streaming body for every non-GET request. In
 * production every write then hung until its deadline killed it: `POST /v1/clients`
 * and `POST /v1/realtime/auth` both returned 504, while GET — the only method that
 * skipped the body stream — answered in under a quarter of a second. The stream
 * never delivered an end, so the body-limit middleware waited forever and the
 * request never reached a route, which is also why nothing was logged.
 *
 * Buffering removes the dependency on that stream ever completing. It cannot hang:
 * either the stream produces bytes and ends, or it produces none.
 *
 * **The bytes are never transformed, and that is load-bearing.** Stripe and Inngest
 * both authenticate by computing an HMAC over the exact body they sent. Any
 * re-serialization — reordered keys, different whitespace, a parsed object turned
 * back into JSON — produces different bytes and every signature check fails. So
 * this returns the raw buffer or nothing at all; it never reconstructs a body it
 * did not receive.
 */
/**
 * Returns `Uint8Array<ArrayBuffer>` rather than `Buffer`, because that is what
 * `Request` accepts as a `BodyInit` — a `Buffer` is backed by `ArrayBufferLike`,
 * which does not satisfy `BufferSource`.
 *
 * The copy through `new Uint8Array(...)` is deliberate and not just a type
 * convenience: `Buffer.concat` can hand back a view into Node's shared allocation
 * pool with a non-zero byte offset, and passing that along risks exposing
 * neighbouring pooled memory rather than only this request's bytes. Copying
 * guarantees the result owns exactly its own contents. Bodies are capped at 1 MiB.
 */
export async function readNodeRequestBody(
	request: IncomingMessage,
	maxBytes = 1024 * 1024,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
	const chunks: Buffer[] = [];
	let totalBytes = 0;
	for await (const chunk of request) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		totalBytes += bytes.byteLength;
		if (totalBytes > maxBytes) {
			throw new RequestBodyTooLargeError(maxBytes);
		}
		chunks.push(bytes);
	}
	return chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

export class RequestBodyTooLargeError extends Error {
	constructor(readonly maxBytes: number) {
		super("Request body exceeds the configured limit.");
		this.name = "RequestBodyTooLargeError";
	}
}
