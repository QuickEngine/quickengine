import { DomainError } from "@quickengine/api-contracts/errors";
import {
	API_HEADERS,
	RATE_LIMIT_HEADERS,
} from "@quickengine/api-contracts/headers";
import {
	CURRENT_API_VERSION,
	VERSION_HEADERS,
} from "@quickengine/api-contracts/versioning";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { createBodyLimit } from "./body-limit";
import type { ApiConfig } from "./config";
import { createCsrfProtection } from "./csrf";
import { createRequestDeadline } from "./deadline";
import { type ApiLogger, noopLogger } from "./logger";
import { MutationPolicyError } from "./mutation-policy";
import { createOpenApiDocument } from "./openapi";
import type { PlatformEnv } from "./platform-types";
import { type ReadinessCheck, respondReadiness } from "./readiness";
import { respond, respondError } from "./respond";
import { isRegisteredStorefrontOrigin } from "./storefront-origins";
import { type ApiTelemetry, noopTelemetry } from "./telemetry";

export function createApp(
	config: ApiConfig,
	options: {
		logger?: ApiLogger;
		readinessChecks?: readonly ReadinessCheck[];
		registerRoutes?: (app: Hono<PlatformEnv>, logger: ApiLogger) => void;
		telemetry?: ApiTelemetry;
	} = {},
) {
	const app = new Hono<PlatformEnv>();
	const logger = options.logger ?? noopLogger;
	const telemetry = options.telemetry ?? noopTelemetry;
	const readinessChecks = options.readinessChecks ?? [];

	app.use("*", requestId({ headerName: "X-Request-Id", limitLength: 128 }));
	// Every response states the version that served it. Cheap, and it turns "which
	// version was that?" from an archaeology exercise into reading a header.
	app.use("*", async (c, next) => {
		await next();
		c.header(VERSION_HEADERS.version, CURRENT_API_VERSION);
	});
	app.use(
		"*",
		secureHeaders({
			contentSecurityPolicy: {
				baseUri: ["'none'"],
				defaultSrc: ["'none'"],
				formAction: ["'none'"],
				frameAncestors: ["'none'"],
			},
			permissionsPolicy: {
				camera: [],
				geolocation: [],
				microphone: [],
				payment: [],
				usb: [],
			},
			referrerPolicy: "no-referrer",
			strictTransportSecurity: "max-age=31536000; includeSubDomains",
			xFrameOptions: "DENY",
		}),
	);
	// API responses can contain workspace, customer, billing or session state.
	// Never let a browser, shared proxy or deployment CDN reuse one for another
	// request. Public catalog caching can return later with explicit tenant-aware
	// cache keys; implicit caching is not a safe optimization.
	app.use("*", async (c, next) => {
		await next();
		c.header("Cache-Control", "no-store");
	});
	app.use("*", async (c, next) => {
		const corsMiddleware = cors({
			// Our own surfaces come from config; a merchant storefront is registered
			// on its API key. Static first because it is free and covers every
			// first-party call — the database is only consulted for an origin we do
			// not already recognise.
			origin: async (origin) => {
				if (config.corsOrigins.has(origin)) return origin;
				return (await isRegisteredStorefrontOrigin(origin)) ? origin : "";
			},
			allowHeaders: [
				API_HEADERS.apiKey,
				"Content-Type",
				API_HEADERS.idempotencyKey,
				API_HEADERS.publishableKey,
				API_HEADERS.customerSession,
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
				// Browser callers must be able to read which version answered, and any
				// deprecation notice — otherwise the warning only reaches server-side
				// integrations and the ones most likely to rot never see it.
				VERSION_HEADERS.version,
				VERSION_HEADERS.deprecation,
				VERSION_HEADERS.sunset,
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
	app.use(
		"*",
		createRequestDeadline(config.requestTimeoutMs, logger, {
			// Inngest's callbacks are control-plane traffic: a sync registers with
			// Inngest over the network, and a run drains a batch of events. Both
			// legitimately outlast a CRUD budget, and returning 504 makes Inngest
			// report the endpoint as unreachable.
			prefixes: ["/api/inngest"],
			timeoutMs: config.callbackTimeoutMs,
		}),
	);
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

	/**
	 * The front door.
	 *
	 * Without this, `api.quickdash.xyz` falls through to the 404 handler and a
	 * developer's first impression of the API is an error envelope for a request
	 * that was not wrong. Every major API answers its own root with a pointer —
	 * this is that pointer, and nothing else.
	 *
	 * Deliberately outside the `/v1` envelope: it is not an API operation, carries
	 * no request id, and needs no version. A machine reading this is lost; a human
	 * reading it wants a link.
	 */
	/**
	 * The front door.
	 *
	 * Without this, `api.quickdash.xyz` falls through to the 404 handler and a
	 * developer's first impression of the API is an error envelope for a request
	 * that was not wrong.
	 *
	 * Content-negotiated, because the two audiences want different things: a
	 * person in a browser gets the wordmark, a script gets JSON it can parse.
	 * Serving one shape to both would mean either escaped newlines in a JSON
	 * string or a machine parsing ASCII art.
	 */
	const WORDMARK = [
		"  ____       _     __    ___           __ ",
		" / __ \\__ __(_)___/ /__ / _ \\___ ____ / / ",
		"/ /_/ / // / / __/  '_// // / _ `(_-</ _ \\",
		"\\___\\_\\_,_/_/\\__/_/\\_\\/____/\\_,_/___/_//_/",
	].join("\n");

	app.get("/", (c) => {
		// QuickDash, not QuickEngine. QuickEngine is the company; QuickDash is the
		// product a developer integrates with, and this host is its API.
		const message =
			"This is the QuickDash API! Docs are available at docs.quickdash.xyz";

		// `Accept` decides. A browser sends `text/html` and never asks for JSON;
		// fetch and curl default to `*/*`, which lands here as JSON.
		// `Accept` decides. A browser sends `text/html` and never asks for JSON;
		// fetch and curl default to `*/*`, which lands here as JSON.
		// `Accept` decides. A browser sends `text/html` and never asks for JSON;
		// fetch and curl default to `*/*`, which lands here as JSON.
		if (c.req.header("accept")?.includes("text/html")) {
			// Left-aligned, four spaces in. Centring the wordmark over the message
			// was tried and read worse — the ragged left edge fought the text.
			const indent = "    ";
			const art = WORDMARK.split("\n")
				.map((line) => `${indent}${line}`)
				.join("\n");

			return c.body(`\n${art}\n\n${indent}${message}\n\n`, 200, {
				"content-type": "text/plain; charset=utf-8",
			});
		}

		// Pretty-printed rather than `c.json`, which minifies. The two extra bytes
		// buy a response that reads as written.
		return c.body(`${JSON.stringify({ message }, null, 2)}\n`, 200, {
			"content-type": "application/json; charset=utf-8",
		});
	});

	app.get("/openapi.json", (c) => c.json(createOpenApiDocument(config)));
	options.registerRoutes?.(app, logger);

	app.notFound((c) =>
		respondError(c, "NOT_FOUND", "The requested resource was not found.", 404),
	);
	app.onError((error, c) => {
		if (error instanceof ZodError) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"The request is invalid.",
				400,
				error.issues,
			);
		}
		if (error instanceof MutationPolicyError) {
			return respondError(c, error.code, error.message, 400);
		}
		if (error instanceof DomainError) {
			return respondError(
				c,
				error.code,
				error.message,
				error.status as ContentfulStatusCode,
			);
		}
		if (error.name === "ClientRecordNotFoundError") {
			return respondError(
				c,
				"NOT_FOUND",
				"The requested record was not found.",
				404,
			);
		}
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
