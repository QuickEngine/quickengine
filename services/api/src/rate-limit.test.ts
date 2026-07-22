import { createMemoryCacheProvider } from "@quickengine/cache";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { noopLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";
import { createRateLimit } from "./rate-limit";

function testApp(options: {
	cache?: ReturnType<typeof createMemoryCacheProvider>;
	failureMode?: "closed" | "open";
	limit?: number;
}) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId());
	app.use("*", async (c, next) => {
		const userId = c.req.header("X-Test-User") ?? "user_1";
		const workspaceId = c.req.header("X-Test-Workspace") ?? "workspace_1";
		c.set("authorized", {
			auditActor: { id: userId, type: "user" },
			principal: { kind: "session", role: "owner", userId },
			workspace: {
				enabledModuleIds: [],
				organizationId: "org_1",
				role: "owner",
				workspace: {
					businessType: "other",
					id: workspaceId,
					name: "Example",
					slug: null,
				},
			},
			workspaceId,
		});
		return next();
	});
	app.get(
		"/limited",
		createRateLimit({
			cache: options.cache ?? createMemoryCacheProvider(),
			logger: noopLogger,
			now: () => 1000,
			policy: {
				failureMode: options.failureMode ?? "closed",
				limit: options.limit ?? 2,
				windowSeconds: 60,
			},
			scope: "clients.read",
		}),
		(c) => c.json({ ok: true }),
	);
	return app;
}

describe("route rate limiting", () => {
	it("returns budgets on success and Retry-After on rejection", async () => {
		const app = testApp({});
		const first = await app.request("/limited");
		const second = await app.request("/limited");
		const rejected = await app.request("/limited");

		expect(first.headers.get("ratelimit-remaining")).toBe("1");
		expect(second.headers.get("ratelimit-remaining")).toBe("0");
		expect(rejected.status).toBe(429);
		expect(rejected.headers.get("retry-after")).toBeTruthy();
		expect((await rejected.json()).error.code).toBe("RATE_LIMITED");
	});

	it("isolates concurrent budgets by verified workspace and principal", async () => {
		const app = testApp({ limit: 1 });
		const [first, rejected, otherUser, otherWorkspace] = await Promise.all([
			app.request("/limited"),
			app.request("/limited"),
			app.request("/limited", { headers: { "X-Test-User": "user_2" } }),
			app.request("/limited", {
				headers: { "X-Test-Workspace": "workspace_2" },
			}),
		]);

		expect([first.status, rejected.status].sort()).toEqual([200, 429]);
		expect(otherUser.status).toBe(200);
		expect(otherWorkspace.status).toBe(200);
	});

	it("supports explicit fail-open and fail-closed dependency policy", async () => {
		const broken = {
			...createMemoryCacheProvider(),
			async increment() {
				throw new Error("cache unavailable");
			},
		};
		const open = await testApp({ cache: broken, failureMode: "open" }).request(
			"/limited",
		);
		const closed = await testApp({
			cache: broken,
			failureMode: "closed",
		}).request("/limited");

		expect(open.status).toBe(200);
		expect(closed.status).toBe(503);
		expect((await closed.json()).error.code).toBe("DEPENDENCY_UNAVAILABLE");
	});
});
