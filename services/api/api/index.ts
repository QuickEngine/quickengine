import type { IncomingMessage, ServerResponse } from "node:http";
import app, {
	RequestBodyTooLargeError,
	readNodeRequestBody,
} from "../dist/index.js";

/**
 * Vercel entry point for the QuickEngine API.
 *
 * The application is runtime-agnostic — `src/app.ts` speaks the Web
 * `Request`/`Response` contract — so this file and `src/server.ts` (the local Node
 * server) are the only places that know how it is being served. Moving hosts means
 * writing another adapter, never touching a route.
 *
 * **Why this is hand-written rather than `handle()` from a library.**
 * `hono/vercel`'s `handle` is the *Edge* adapter: it assumes the platform passes a
 * Web `Request`. This function runs on the Node runtime — required for Postgres,
 * the Redis TCP fallback, and `node:crypto` in the webhook signer — where Vercel
 * passes Node's `IncomingMessage`/`ServerResponse` instead. Using the Edge adapter
 * here failed on the first request with `this.raw.headers.get is not a function`,
 * because Hono was handed plain Node headers. `@hono/node-server` shipped a Vercel
 * adapter in v1 but dropped it in v2, so the translation lives here.
 *
 * **This must import `dist`, not `src`.** Vercel transpiles this file but does not
 * bundle what it imports, so a `../src/index` import survives into the deployment
 * as a specifier pointing at TypeScript that was never compiled. `tsup` inlines
 * every workspace package into `dist`, which is the only form the function can
 * load; `vercel.json` pins `includeFiles: "dist/**"` so it definitely ships.
 */
export const config = {
	runtime: "nodejs",
};

/** Node's header bag allows repeated values; a Web `Headers` must preserve them. */
function toWebHeaders(message: IncomingMessage): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(message.headers)) {
		if (Array.isArray(value)) {
			for (const entry of value) headers.append(name, entry);
		} else if (value !== undefined) {
			headers.set(name, value);
		}
	}
	return headers;
}

export default async function handler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	// Vercel terminates TLS upstream, so the scheme is always https in practice;
	// the host header is what makes the URL absolute, which `new Request` requires.
	const host = req.headers.host ?? "localhost";
	const url = new URL(req.url ?? "/", `https://${host}`);
	const method = req.method ?? "GET";
	const hasBody = method !== "GET" && method !== "HEAD";

	// Buffered, not streamed. Handing `Readable.toWeb(req)` to `Request` hung every
	// write in production until its deadline expired — the stream never signalled
	// end, so the body-limit middleware waited forever and no route was ever
	// reached. GET was unaffected only because it skips the body entirely.
	let body: Uint8Array<ArrayBuffer> | undefined;
	try {
		body = hasBody
			? await readNodeRequestBody(
					req,
					Number(process.env.API_BODY_LIMIT_BYTES ?? 1024 * 1024),
				)
			: undefined;
	} catch (error) {
		if (!(error instanceof RequestBodyTooLargeError)) throw error;
		res.statusCode = 413;
		res.setHeader("content-type", "application/json; charset=UTF-8");
		res.setHeader("cache-control", "no-store");
		res.end(
			JSON.stringify({
				error: {
					code: "PAYLOAD_TOO_LARGE",
					message: "The request body is too large.",
				},
			}),
		);
		return;
	}

	const request = new Request(url, {
		method,
		headers: toWebHeaders(req),
		body,
	});

	const response = await app.fetch(request);

	res.statusCode = response.status;
	// `Headers.forEach` joins repeated values with commas. That is correct for every
	// header except Set-Cookie, where it would merge separate cookies into one
	// unusable value — `getSetCookie()` returns them intact.
	response.headers.forEach((value, name) => {
		if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
	});
	const cookies = response.headers.getSetCookie?.() ?? [];
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);

	if (response.body) {
		const reader = response.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			res.write(value);
		}
	}
	res.end();
}
