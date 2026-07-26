import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { AuthorizedApiContext, PlatformEnv } from "./platform-types";
import { createUsageMetering } from "./usage-metering";

const authorized: AuthorizedApiContext = {
	auditActor: { id: "key_1", type: "api_key" },
	principal: { keyId: "key_1", kind: "key", type: "secret" },
	workspace: {
		enabledModuleIds: ["client-records"],
		organizationId: null,
		ownerId: "user_owner",
		workspace: {
			businessType: "agency",
			id: "11111111-1111-4111-8111-111111111111",
			name: "Acme",
			slug: "acme",
		},
	},
	workspaceId: "11111111-1111-4111-8111-111111111111",
};

/** An app where `/authed` authorizes and `/health` does not, as in production. */
function harness(options: {
	record: Parameters<typeof createUsageMetering>[0]["record"];
	enabled?: boolean;
}) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId());
	app.use("*", createUsageMetering({ ...options }));
	app.get("/authed", (c) => {
		c.set("authorized", authorized);
		return c.json({ ok: true });
	});
	app.get("/health", (c) => c.json({ ok: true }));
	app.get("/rejected", (c) => c.json({ error: "nope" }, 401));
	return app;
}

describe("createUsageMetering", () => {
	it("records one action for an authorized request", async () => {
		const calls: unknown[] = [];
		const app = harness({
			enabled: true,
			record: async (input) => {
				calls.push(input);
			},
		});

		await app.request("/authed");
		expect(calls).toEqual([
			{ scopeId: "user_owner", meter: "actions", amount: 1 },
		]);
	});

	/**
	 * The exclusion rule, expressed as a property rather than a path list: anything
	 * that never authorized is never billed. A list would drift the first time a
	 * route was added; this cannot.
	 */
	it("does not record a request that never authorized", async () => {
		const calls: unknown[] = [];
		const app = harness({
			enabled: true,
			record: async (input) => {
				calls.push(input);
			},
		});

		const response = await app.request("/health");
		// Asserting the status too: a guard that threw instead of skipping would
		// still leave `calls` empty, so the absence of billing alone proves nothing.
		expect(response.status).toBe(200);
		expect(calls).toEqual([]);
	});

	/**
	 * Billing someone for being turned away is indefensible — and it would let
	 * anyone inflate a stranger's usage by guessing keys against their workspace.
	 */
	it("does not record a rejected request", async () => {
		const calls: unknown[] = [];
		const app = harness({
			enabled: true,
			record: async (input) => {
				calls.push(input);
			},
		});

		const response = await app.request("/rejected");
		expect(response.status).toBe(401);
		expect(calls).toEqual([]);
	});

	it("records nothing when disabled", async () => {
		const calls: unknown[] = [];
		const app = harness({
			enabled: false,
			record: async (input) => {
				calls.push(input);
			},
		});

		await app.request("/authed");
		expect(calls).toEqual([]);
	});

	/**
	 * The property that matters most in production: the customer's request has
	 * already succeeded by the time this runs. Losing a count must never turn a
	 * working API call into a failure — under-billing is recoverable, breaking a
	 * request is not.
	 */
	it("never fails the request when recording throws", async () => {
		const app = harness({
			enabled: true,
			record: async () => {
				throw new Error("usage store unavailable");
			},
		});

		const response = await app.request("/authed");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("meters each authorized request separately", async () => {
		const calls: unknown[] = [];
		const app = harness({
			enabled: true,
			record: async (input) => {
				calls.push(input);
			},
		});

		await app.request("/authed");
		await app.request("/authed");
		await app.request("/health");
		expect(calls).toHaveLength(2);
	});
});
