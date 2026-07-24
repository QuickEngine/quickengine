import { createMiddleware } from "hono/factory";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Sets a cooperative abort signal and returns a bounded 504 response.
 *
 * This cannot cancel arbitrary JavaScript or a database commit by itself. Every command must
 * consume `abortSignal`, and the future Postgres unit of work must also set transaction-local
 * statement and lock timeouts. A timed-out mutation keeps its durable idempotency state pending
 * until the database adapter can determine the commit outcome.
 */
export function createRequestDeadline(timeoutMs: number, logger: ApiLogger) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		const controller = new AbortController();
		const deadlineAtMs = Date.now() + timeoutMs;
		const clientSignal = c.req.raw.signal;
		const abortFromClient = () => controller.abort(clientSignal.reason);
		if (clientSignal.aborted) abortFromClient();
		else
			clientSignal.addEventListener("abort", abortFromClient, { once: true });

		c.set("abortSignal", controller.signal);
		c.set("deadlineAtMs", deadlineAtMs);

		let timer: ReturnType<typeof setTimeout> | undefined;
		let timedOut = false;
		const downstream = (async () => {
			await next();
			return c.res;
		})();
		const deadline = new Promise<Response>((resolve) => {
			timer = setTimeout(() => {
				timedOut = true;
				logger.warn("request.timed_out", {
					method: c.req.method,
					requestId: c.get("requestId"),
					route: c.req.routePath || "unmatched",
					timeoutMs,
				});
				const response = new Response(
					JSON.stringify({
						error: {
							code: "REQUEST_TIMEOUT",
							message: "The request exceeded its processing deadline.",
							requestId: c.get("requestId"),
						},
					}),
					{ headers: { "Content-Type": "application/json" }, status: 504 },
				);
				// Let Hono finalize the timeout response before cooperative listeners unwind.
				resolve(response);
				queueMicrotask(() =>
					controller.abort(
						new DOMException("Request deadline exceeded", "TimeoutError"),
					),
				);
			}, timeoutMs);
		});

		try {
			const response = await Promise.race([downstream, deadline]);
			if (timedOut) {
				void downstream.catch((error) =>
					logger.error("request.late_failure", {
						error,
						requestId: c.get("requestId"),
						route: c.req.routePath || "unmatched",
					}),
				);
			}
			return response;
		} finally {
			if (timer) clearTimeout(timer);
			clientSignal.removeEventListener("abort", abortFromClient);
		}
	});
}
