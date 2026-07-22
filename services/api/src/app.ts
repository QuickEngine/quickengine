import { Hono } from "hono";
import { cors } from "hono/cors";
import { type RequestIdVariables, requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { ApiConfig } from "./config";
import { createOpenApiDocument } from "./openapi";
import { respond, respondError } from "./respond";

export function createApp(config: ApiConfig) {
	const app = new Hono<{ Variables: RequestIdVariables }>();

	app.use("*", requestId({ headerName: "X-Request-Id", limitLength: 128 }));
	app.use("*", secureHeaders());
	app.use("*", async (c, next) => {
		const corsMiddleware = cors({
			origin: (origin) => (config.corsOrigins.has(origin) ? origin : ""),
			allowHeaders: [
				"Authorization",
				"Content-Type",
				"Idempotency-Key",
				"X-Request-Id",
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
			exposeHeaders: ["X-Request-Id"],
			credentials: true,
			maxAge: 600,
		});
		return corsMiddleware(c, next);
	});
	app.use("*", async (c, next) => {
		await next();
		c.header("X-Request-Id", c.get("requestId"));
	});

	app.get("/health", (c) =>
		respond(c, {
			service: "quickengine-api",
			status: "ok",
			version: config.version,
		}),
	);

	app.get("/ready", (c) =>
		respond(c, {
			checks: [],
			service: "quickengine-api",
			status: "ready",
		}),
	);

	app.get("/version", (c) =>
		respond(c, {
			service: "quickengine-api",
			version: config.version,
		}),
	);

	app.get("/openapi.json", (c) => respond(c, createOpenApiDocument(config)));

	app.notFound((c) =>
		respondError(c, "NOT_FOUND", "The requested resource was not found.", 404),
	);
	app.onError((_error, c) =>
		respondError(c, "INTERNAL_ERROR", "An unexpected error occurred.", 500),
	);

	return app;
}

export type QuickEngineApi = ReturnType<typeof createApp>;
