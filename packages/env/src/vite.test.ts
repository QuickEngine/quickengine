import { describe, expect, it } from "vitest";
import { createViteClientEnv } from "./vite";

const productionEnvironment = {
	VITE_WEB_URL: "https://quickengine.xyz",
	VITE_AUTH_URL: "https://auth.quickengine.xyz",
	VITE_ACCOUNT_URL: "https://account.quickengine.xyz",
	VITE_DASH_URL: "https://dash.quickengine.xyz",
	VITE_API_URL: "https://api.quickengine.xyz",
};

describe("Vite client environment", () => {
	it("uses the documented local origins only in development", () => {
		expect(createViteClientEnv({}, { mode: "development" })).toMatchObject({
			VITE_WEB_URL: "http://localhost:3000",
			VITE_ACCOUNT_URL: "http://localhost:3001",
			VITE_AUTH_URL: "http://localhost:3002",
			VITE_DASH_URL: "http://localhost:3011",
			VITE_API_URL: "http://localhost:3020",
		});
	});

	it("requires every application origin in production", () => {
		expect(() =>
			createViteClientEnv({}, { mode: "production" }),
		).toThrowError();
	});

	it("accepts and normalizes secure production origins", () => {
		expect(
			createViteClientEnv(
				{
					...productionEnvironment,
					VITE_AUTH_URL: "https://auth.quickengine.xyz/",
				},
				{ mode: "production" },
			).VITE_AUTH_URL,
		).toBe("https://auth.quickengine.xyz");
	});

	it.each([
		["an insecure origin", "VITE_AUTH_URL", "http://auth.quickengine.xyz"],
		["localhost", "VITE_DASH_URL", "https://localhost:3011"],
		["an IP loopback", "VITE_API_URL", "https://127.0.0.1:3020"],
		["an IPv6 loopback", "VITE_API_URL", "https://[::1]:3020"],
		["an all-interface address", "VITE_API_URL", "https://0.0.0.0:3020"],
	])("rejects %s in production", (_label, key, value) => {
		expect(() =>
			createViteClientEnv(
				{ ...productionEnvironment, [key]: value },
				{ mode: "production" },
			),
		).toThrowError("Invalid production Vite environment");
	});

	it.each([
		"https://user:password@auth.quickengine.xyz",
		"https://auth.quickengine.xyz/signin",
		"https://auth.quickengine.xyz?source=web",
		"https://auth.quickengine.xyz#signin",
	])("rejects a non-origin URL: %s", (value) => {
		expect(() =>
			createViteClientEnv(
				{ ...productionEnvironment, VITE_AUTH_URL: value },
				{ mode: "production" },
			),
		).toThrowError();
	});

	it("turns blank optional integrations into undefined", () => {
		expect(
			createViteClientEnv(
				{
					...productionEnvironment,
					VITE_PUSHER_KEY: "",
					VITE_SENTRY_DSN: "",
				},
				{ mode: "production" },
			),
		).toMatchObject({
			VITE_PUSHER_KEY: undefined,
			VITE_SENTRY_DSN: undefined,
		});
	});
});
