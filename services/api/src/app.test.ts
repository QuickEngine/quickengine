import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";

const config: ApiConfig = {
	baseUrl: "https://api.quickengine.xyz",
	corsOrigins: new Set(["https://dash.quickengine.xyz"]),
	environment: "test",
	port: 3020,
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

		expect(body.data.openapi).toBe("3.1.0");
		expect(body.data.info.version).toBe(config.version);
		expect(body.data.servers).toEqual([{ url: config.baseUrl }]);
		expect(Object.keys(body.data.paths)).toEqual([
			"/health",
			"/ready",
			"/version",
		]);
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
});
