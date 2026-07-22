import { API_HEADERS } from "@quickengine/api-contracts/headers";
import { createMiddleware } from "hono/factory";
import type { ApiConfig } from "./config";
import type { PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Cookie-authenticated browser writes require a known first-party Origin. */
export function createCsrfProtection(config: ApiConfig) {
	return createMiddleware<PlatformEnv>(async (c, next) => {
		if (SAFE_METHODS.has(c.req.method)) return next();

		const hasCookie = Boolean(c.req.header("Cookie"));
		const authorization = c.req.header(API_HEADERS.apiKey);
		const hasApiCredential = Boolean(
			(authorization && /^Bearer\s+\S+/i.test(authorization)) ||
				c.req.header(API_HEADERS.publishableKey),
		);
		if (!hasCookie || hasApiCredential) return next();

		const origin = c.req.header("Origin");
		if (!origin || !config.corsOrigins.has(origin)) {
			return respondError(
				c,
				"CSRF_REJECTED",
				"Cookie-authenticated writes require an approved first-party origin.",
				403,
			);
		}

		return next();
	});
}
