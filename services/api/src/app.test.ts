import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";

const config: ApiConfig = {
	baseUrl: "https://api.quickengine.xyz",
	corsOrigins: new Set(["https://dash.quickengine.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

describe("QuickEngine API foundation", () => {
	const app = createApp(config);

	it.each(["/health", "/ready", "/version"])(
		"serves %s in the standard envelope",
		async (path) => {
			const response = await app.request(path);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(response.headers.get("x-request-id")).toBeTruthy();
			expect(body).toMatchObject({ data: { service: "quickengine-api" } });
			expect(body.meta.requestId).toBe(response.headers.get("x-request-id"));
		},
	);

	it("preserves a bounded caller request ID", async () => {
		const response = await app.request("/health", {
			headers: { "X-Request-Id": "request-from-edge" },
		});
		const body = await response.json();

		expect(response.headers.get("x-request-id")).toBe("request-from-edge");
		expect(body.meta.requestId).toBe("request-from-edge");
	});

	it("returns a valid OpenAPI foundation", async () => {
		const response = await app.request("/openapi.json");
		const body = await response.json();

		expect(body.openapi).toBe("3.1.0");
		expect(body.info.version).toBe(config.version);
		expect(body.servers).toEqual([{ url: config.baseUrl }]);
		expect(Object.keys(body.paths)).toEqual(["/health", "/ready", "/version"]);
	});

	it("uses the standard error envelope for unknown routes", async () => {
		const response = await app.request("/missing");
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toMatchObject({
			error: {
				code: "NOT_FOUND",
				message: "The requested resource was not found.",
			},
		});
		expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
	});

	it("allows only configured credentialed CORS origins", async () => {
		const allowed = await app.request("/health", {
			headers: { Origin: "https://dash.quickengine.xyz" },
		});
		const denied = await app.request("/health", {
			headers: { Origin: "https://example.com" },
		});

		expect(allowed.headers.get("access-control-allow-origin")).toBe(
			"https://dash.quickengine.xyz",
		);
		expect(allowed.headers.get("access-control-allow-credentials")).toBe(
			"true",
		);
		expect(denied.headers.get("access-control-allow-origin")).toBeNull();
	});

	it("preflights every platform authentication and context header", async () => {
		const response = await app.request("/future", {
			method: "OPTIONS",
			headers: {
				"Access-Control-Request-Headers":
					"Authorization, QuickEngine-Publishable-Key, QuickEngine-Workspace, X-Request-Id",
				"Access-Control-Request-Method": "GET",
				Origin: "https://dash.quickengine.xyz",
			},
		});

		expect(response.status).toBe(204);
		const allowedHeaders =
			response.headers.get("access-control-allow-headers") ?? "";
		expect(allowedHeaders).toContain("Authorization");
		expect(allowedHeaders).toContain("QuickEngine-Publishable-Key");
		expect(allowedHeaders).toContain("QuickEngine-Workspace");
	});

	it("protects cookie-authenticated writes from cross-site requests", async () => {
		const denied = await app.request("/future-write", {
			method: "POST",
			headers: {
				Cookie: "quickengine.session=fake",
				Origin: "https://example.com",
			},
		});
		const allowed = await app.request("/future-write", {
			method: "POST",
			headers: {
				Cookie: "quickengine.session=fake",
				Origin: "https://dash.quickengine.xyz",
			},
		});

		expect(denied.status).toBe(403);
		expect((await denied.json()).error.code).toBe("CSRF_REJECTED");
		expect(allowed.status).toBe(404);
	});

	it("publishes request timing without logging request bodies", async () => {
		const lines: Array<{ message: string; route: string }> = [];
		const observed = createApp(config, {
			logger: {
				debug() {},
				info(message, fields) {
					lines.push({ message, route: String(fields?.route) });
				},
				warn() {},
				error() {},
			},
		});
		const response = await observed.request("/health");

		expect(response.headers.get("server-timing")).toMatch(/^app;dur=/);
		expect(lines).toEqual([{ message: "request.completed", route: "/health" }]);
	});
});
