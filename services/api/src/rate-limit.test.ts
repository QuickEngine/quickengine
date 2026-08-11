import { PLANS } from "@quickengine/billing";
import { createMemoryCacheProvider } from "@quickengine/cache";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { noopLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";
import {
	createRateLimit,
	PLAN_RATE_MULTIPLIER,
	policyForPlan,
	RATE_LIMIT_POLICIES,
} from "./rate-limit";

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
				ownerId: "user_owner",
				capabilities: [
					"workspace.view",
					"workspace.manage",
					"workspace.delete",
					"modules.manage",
					"members.manage",
					"apikeys.manage",
					"billing.manage",
					"records.write",
				],
				role: "owner",
				workspace: {
					businessType: "other",
					environment: "live",
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

describe("policyForPlan", () => {
	const base = {
		failureMode: "closed",
		limit: 600,
		windowSeconds: 60,
	} as const;

	it("tightens Free and loosens paid tiers", () => {
		expect(policyForPlan(base, "free").limit).toBe(150);
		expect(policyForPlan(base, "grow").limit).toBe(1200);
		expect(policyForPlan(base, "scale").limit).toBe(2400);
	});

	it("leaves the base policy untouched at the reference tier", () => {
		expect(policyForPlan(base, "launch")).toBe(base);
	});

	/**
	 * Outside production, usage enforcement is off and no plan is resolved. The
	 * base policy has to apply rather than the account being locked out.
	 */
	it("falls back to the base policy for an unknown or missing plan", () => {
		expect(policyForPlan(base, undefined)).toBe(base);
		expect(policyForPlan(base, "not-a-plan")).toBe(base);
	});

	// A small multiplier on a small policy must never round down to zero, which
	// would lock an account out of its own API entirely.
	it("never produces a limit below one", () => {
		const tiny = {
			failureMode: "closed",
			limit: 2,
			windowSeconds: 60,
		} as const;
		expect(policyForPlan(tiny, "free").limit).toBeGreaterThanOrEqual(1);
	});

	it("preserves window and failure mode", () => {
		const scaled = policyForPlan(base, "scale");
		expect(scaled.windowSeconds).toBe(60);
		expect(scaled.failureMode).toBe("closed");
	});
});

describe("plan coverage", () => {
	// 🔴 Regression guard. `teams` was added to `plans.ts` and missed here, and an
	// unlisted plan falls back to multiplier 1 — silently giving the most
	// expensive tier stricter limits than the one below it. Nothing about that
	// looks wrong until a customer complains, so the coupling is pinned here.
	it("gives every sellable plan a rate multiplier", () => {
		for (const plan of PLANS) {
			expect(
				PLAN_RATE_MULTIPLIER[plan.id],
				`${plan.id} has no rate multiplier`,
			).toBeTypeOf("number");
		}
	});

	// A paid tier that throttles harder than a cheaper one is always a mistake.
	it("never lets a higher tier have a lower multiplier", () => {
		const ladder = ["free", "launch", "grow", "scale", "teams"] as const;
		for (let i = 1; i < ladder.length; i++) {
			expect(PLAN_RATE_MULTIPLIER[ladder[i]]).toBeGreaterThanOrEqual(
				PLAN_RATE_MULTIPLIER[ladder[i - 1]],
			);
		}
	});
});

describe("advertised limits", () => {
	// 🔴 Regression guard. Both writeHeaders calls previously passed the unscaled
	// base policy, so a Free account saw 600 while being cut off at 150.
	it("reports the plan-scaled ceiling, not the base policy", () => {
		const base = RATE_LIMIT_POLICIES.read;
		expect(policyForPlan(base, "free").limit).toBe(
			Math.max(1, Math.round(base.limit * PLAN_RATE_MULTIPLIER.free)),
		);
		expect(policyForPlan(base, "teams").limit).toBe(
			base.limit * PLAN_RATE_MULTIPLIER.teams,
		);
		// And the base is unchanged by scaling — a shared object would corrupt
		// every later request on the process.
		expect(base.limit).toBe(RATE_LIMIT_POLICIES.read.limit);
	});
});
