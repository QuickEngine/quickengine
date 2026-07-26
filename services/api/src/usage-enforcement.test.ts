import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { PlatformEnv } from "./platform-types";
import {
	enforceUsage,
	USAGE_HEADERS,
	type UsageDecision,
	type UsageEnforcer,
} from "./usage-enforcement";

const ok: UsageDecision = {
	allowed: true,
	state: "ok",
	used: 10,
	limit: 1000,
	remaining: 990,
};
const warn: UsageDecision = { ...ok, state: "warn", used: 850, remaining: 150 };
const over: UsageDecision = {
	allowed: false,
	state: "over",
	used: 1100,
	limit: 1000,
	remaining: 0,
};

function harness(enforcer?: UsageEnforcer) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId());
	app.get("/thing", async (c) => {
		const rejection = await enforceUsage(c, enforcer, "user_owner");
		if (rejection) return rejection;
		return c.json({ ok: true });
	});
	return app;
}

describe("enforceUsage", () => {
	it("allows a request within the allowance and reports headers", async () => {
		const response = await harness(async () => ok).request("/thing");
		expect(response.status).toBe(200);
		expect(response.headers.get(USAGE_HEADERS.state)).toBe("ok");
		expect(response.headers.get(USAGE_HEADERS.used)).toBe("10");
		expect(response.headers.get(USAGE_HEADERS.limit)).toBe("1000");
		expect(response.headers.get(USAGE_HEADERS.remaining)).toBe("990");
	});

	/**
	 * The 80% nudge has to be visible *before* the wall, or the first a customer
	 * hears of it is a failure. The request itself is unaffected.
	 */
	it("warns without blocking", async () => {
		const response = await harness(async () => warn).request("/thing");
		expect(response.status).toBe(200);
		expect(response.headers.get(USAGE_HEADERS.state)).toBe("warn");
	});

	it("refuses past the ceiling with 402, not 429", async () => {
		const response = await harness(async () => over).request("/thing");
		// 429 would tell a client to back off and retry. Retrying never helps here;
		// only an upgrade or a top-up does.
		expect(response.status).toBe(402);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe("USAGE_LIMIT_EXCEEDED");
	});

	it("still reports headers when refusing, so the client can see why", async () => {
		const response = await harness(async () => over).request("/thing");
		expect(response.headers.get(USAGE_HEADERS.state)).toBe("over");
		expect(response.headers.get(USAGE_HEADERS.used)).toBe("1100");
	});

	/**
	 * The property that matters most in production: a billing outage must not
	 * become a product outage. Under-counting is far cheaper than refusing
	 * traffic we have no reason to refuse.
	 */
	it("allows the request when the usage store fails", async () => {
		const response = await harness(async () => {
			throw new Error("usage store unavailable");
		}).request("/thing");
		expect(response.status).toBe(200);
	});

	it("is a no-op when no enforcer is configured", async () => {
		const response = await harness(undefined).request("/thing");
		expect(response.status).toBe(200);
		expect(response.headers.get(USAGE_HEADERS.state)).toBeNull();
	});

	it("omits limit headers for an unlimited plan", async () => {
		const response = await harness(async () => ({
			allowed: true,
			state: "ok" as const,
			used: 5_000,
			limit: null,
			remaining: null,
		})).request("/thing");
		expect(response.status).toBe(200);
		expect(response.headers.get(USAGE_HEADERS.limit)).toBeNull();
		expect(response.headers.get(USAGE_HEADERS.used)).toBe("5000");
	});
});
