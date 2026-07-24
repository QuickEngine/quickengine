import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./config";

describe("loadApiConfig", () => {
	it("provides safe local defaults", () => {
		const config = loadApiConfig({ NODE_ENV: "test" });

		expect(config.port).toBe(3020);
		expect(config.baseUrl).toBe("http://localhost:3020");
		expect(config.bodyLimitBytes).toBe(1024 * 1024);
		expect(config.requestTimeoutMs).toBe(10_000);
		expect(config.readinessTimeoutMs).toBe(2000);
		expect(config.corsOrigins.has("http://localhost:3011")).toBe(true);
	});

	it("normalizes an explicit CORS allowlist", () => {
		const config = loadApiConfig({
			API_CORS_ORIGINS: "https://one.example, https://two.example ",
			NODE_ENV: "production",
		});

		expect([...config.corsOrigins]).toEqual([
			"https://one.example",
			"https://two.example",
		]);
	});

	it("rejects invalid ports and base URLs", () => {
		expect(() => loadApiConfig({ API_PORT: "70000" })).toThrow();
		expect(() => loadApiConfig({ API_BASE_URL: "not-a-url" })).toThrow();
		expect(() => loadApiConfig({ API_BODY_LIMIT_BYTES: "100" })).toThrow();
	});
});
