import {
	API_HEADERS,
	RATE_LIMIT_HEADERS,
} from "@quickengine/api-contracts/headers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { createBodyLimit } from "./body-limit";
import type { ApiConfig } from "./config";
import { createCsrfProtection } from "./csrf";
import { createRequestDeadline } from "./deadline";
import { type ApiLogger, noopLogger } from "./logger";
import { createOpenApiDocument } from "./openapi";
import type { PlatformEnv } from "./platform-types";
import { type ReadinessCheck, respondReadiness } from "./readiness";
import { respond, respondError } from "./respond";
import { type ApiTelemetry, noopTelemetry } from "./telemetry";

export function createApp(
	config: ApiConfig,
	options: {
		logger?: ApiLogger;
		readinessChecks?: readonly ReadinessCheck[];
		telemetry?: ApiTelemetry;
	} = {},
) {
	const app = new Hono<PlatformEnv>();
	const logger = options.logger ?? noopLogger;
	const telemetry = options.telemetry ?? noopTelemetry;
	const readinessChecks = options.readinessChecks ?? [];

	app.use("*", requestId({ headerName: "X-Request-Id", limitLength: 128 }));
	app.use("*", secureHeaders());
	app.use("*", async (c, next) => {
		const corsMiddleware = cors({
			origin: (origin) => (config.corsOrigins.has(origin) ? origin : ""),
			allowHeaders: [
				API_HEADERS.apiKey,
				"Content-Type",
				API_HEADERS.idempotencyKey,
				API_HEADERS.publishableKey,
				API_HEADERS.requestId,
				API_HEADERS.workspace,
			],
			allowMethods: [
				"GET",
				"HEAD",
				"POST",
				"PUT",
				"PATCH",
				"DELETE",
				"OPTIONS",
			],
			exposeHeaders: [
				API_HEADERS.requestId,
				API_HEADERS.idempotencyReplayed,
				RATE_LIMIT_HEADERS.limit,
				RATE_LIMIT_HEADERS.remaining,
				RATE_LIMIT_HEADERS.reset,
				RATE_LIMIT_HEADERS.retryAfter,
				"Server-Timing",
			],
			credentials: true,
			maxAge: 600,
		});
		return corsMiddleware(c, next);
	});
	app.use("*", async (c, next) => {
		const startedAt = performance.now();
		await telemetry.withSpan(
			`${c.req.method} request`,
			{
				"http.request.method": c.req.method,
			},
			() => next(),
		);
		const durationMs = performance.now() - startedAt;
		const route = c.req.routePath || "unmatched";
		c.header("X-Request-Id", c.get("requestId"));
		c.header("Server-Timing", `app;dur=${durationMs.toFixed(2)}`);
		logger.info("request.completed", {
			durationMs: Number(durationMs.toFixed(2)),
			method: c.req.method,
			route,
			requestId: c.get("requestId"),
			status: c.res.status,
		});
	});
	app.use("*", createRequestDeadline(config.requestTimeoutMs, logger));
	app.use("*", createBodyLimit(config.bodyLimitBytes));
	app.use("*", createCsrfProtection(config));

	app.get("/health", (c) =>
		respond(c, {
			service: "quickengine-api",
			status: "ok",
			version: config.version,
		}),
	);

	app.get("/ready", (c) =>
		respondReadiness(c, readinessChecks, config.readinessTimeoutMs),
	);

	app.get("/version", (c) =>
		respond(c, {
			service: "quickengine-api",
			version: config.version,
		}),
	);

	app.get("/openapi.json", (c) => c.json(createOpenApiDocument(config)));

	app.notFound((c) =>
		respondError(c, "NOT_FOUND", "The requested resource was not found.", 404),
	);
	app.onError((error, c) => {
		const context = {
			method: c.req.method,
			route: c.req.routePath || "unmatched",
			requestId: c.get("requestId"),
		};
		logger.error("request.failed", { ...context, error });
		telemetry.captureException(error, context);
		return respondError(
			c,
			"INTERNAL_ERROR",
			"An unexpected error occurred.",
			500,
		);
	});

	return app;
}

export type QuickEngineApi = ReturnType<typeof createApp>;
