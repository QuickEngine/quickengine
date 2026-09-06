import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type { PlatformDependencies } from "./platform-types";

const config: ApiConfig = {
	baseUrl: "https://api.quickdash.xyz",
	bodyLimitBytes: 1_000_000,
	corsOrigins: new Set(["https://quickdash.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	callbackTimeoutMs: 50_000,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 5_000,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "22222222-2222-4222-8222-222222222222";

/** Nobody: every lookup fails, so authorization refuses before anything runs. */
const stranger: PlatformDependencies = {
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	getWorkspaceForKey: async () => null,
	verifyApiKey: async () => null,
};

/** A real server key carrying `agents:run`, resolving to a real workspace. */
const holder = (organizationId: string | null): PlatformDependencies => ({
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	verifyApiKey: async () => ({
		allowedOrigins: [],
		capabilities: ["agents:run"],
		id: "key_1",
		type: "secret",
		workspaceId: WORKSPACE,
	}),
	getWorkspaceForKey: async () => ({
		enabledModuleIds: [],
		organizationId,
		ownerId: "owner_1",
		workspace: {
			businessType: "retail",
			environment: "test",
			id: WORKSPACE,
			name: "Northwind",
			published: true,
			slug: "northwind",
		},
	}),
});

const build = async (dependencies: PlatformDependencies) => {
	const { registerAllRoutes } = await import("./register-routes");
	return createApp(config, {
		logger: noopLogger,
		registerRoutes: (app, logger) =>
			registerAllRoutes(app, { dependencies, logger }),
	});
};

const post = (app: Awaited<ReturnType<typeof build>>, body: unknown) =>
	app.request("/v1/agents/runs", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: "Bearer qsk_test",
			origin: "https://quickdash.xyz",
		},
		body: JSON.stringify(body),
	});

const admitAiSpend = vi.fn();
const recordAiSpend = vi.fn();
const runAgent = vi.fn();

vi.mock("@quickengine/billing", async (importOriginal) => ({
	...(await importOriginal<object>()),
	admitAiSpend: (...args: unknown[]) => admitAiSpend(...args),
	recordAiSpend: (...args: unknown[]) => recordAiSpend(...args),
}));

vi.mock("@quickengine/agent-runtime", async (importOriginal) => ({
	...(await importOriginal<object>()),
	runAgent: (...args: unknown[]) => runAgent(...args),
}));

/**
 * The agent surface exists because `runAgent` was complete, exported, tested
 * and called by NOTHING — a finished subsystem with no door. These tests guard
 * the door, and specifically the money, because a run costs real money the
 * moment it starts.
 */
describe("agent runs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ANTHROPIC_API_KEY = "sk-test";
		admitAiSpend.mockResolvedValue({
			allowed: true,
			fundedBy: "allowance",
			maxCostMicros: 50_000,
		});
		recordAiSpend.mockResolvedValue(undefined);
		runAgent.mockResolvedValue({
			status: "completed",
			content: "Nothing unusual this week.",
			usage: { costMicros: 1_234 },
		});
	});

	it("is registered and refuses a stranger without 500ing", async () => {
		const app = await build(stranger);
		const res = await post(app, { prompt: "hello" });

		// Not 404 (unregistered) and not 500 (throws before it can refuse).
		expect(res.status).not.toBe(404);
		expect(res.status).toBeLessThan(500);
		expect(runAgent).not.toHaveBeenCalled();
	});

	it("runs, then draws down exactly what the run cost", async () => {
		const app = await build(holder(ORGANIZATION));
		const res = await post(app, { prompt: "Summarise this week." });

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.status).toBe("completed");
		expect(body.data.costMicros).toBe(1_234);
		expect(recordAiSpend).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: ORGANIZATION,
				workspaceId: WORKSPACE,
				costMicros: 1_234,
				fundedBy: "allowance",
			}),
		);
	});

	it("gives the run admission's ceiling, never the caller's wish", async () => {
		const app = await build(holder(ORGANIZATION));
		await post(app, { prompt: "go", maxSteps: 12 });

		const budget = runAgent.mock.calls[0]?.[0]?.budget;
		expect(budget.maxCostMicros).toBe(50_000);
	});

	it("scopes the run to the authorized workspace and no other", async () => {
		const app = await build(holder(ORGANIZATION));
		await post(app, { prompt: "go" });

		const scope = runAgent.mock.calls[0]?.[0]?.scope;
		expect(scope.organizationId).toBe(ORGANIZATION);
		expect(scope.workspaceGrants).toEqual([
			{ workspaceId: WORKSPACE, access: "read" },
		]);
	});

	it("refuses before running when there is nothing to charge against", async () => {
		admitAiSpend.mockResolvedValue({
			allowed: false,
			reason: "no_balance",
			message: "Add credits to run agents.",
		});
		const app = await build(holder(ORGANIZATION));
		const res = await post(app, { prompt: "go" });

		expect(res.status).toBe(402);
		expect((await res.json()).error.code).toBe("PLAN_UPGRADE_REQUIRED");
		// 🔴 The point of admitting FIRST: nothing was spent.
		expect(runAgent).not.toHaveBeenCalled();
		expect(recordAiSpend).not.toHaveBeenCalled();
	});

	it("still records spend when the run throws", async () => {
		// 🔴 Tokens burned before an error are billed by the provider regardless.
		// Skipping the drawdown here would let a caller run for free by making
		// runs fail on purpose.
		runAgent.mockRejectedValue(new Error("provider exploded"));
		const app = await build(holder(ORGANIZATION));
		const res = await post(app, { prompt: "go" });

		expect(res.status).toBeGreaterThanOrEqual(500);
		expect(recordAiSpend).toHaveBeenCalledTimes(1);
		expect(recordAiSpend).toHaveBeenCalledWith(
			expect.objectContaining({ costMicros: 50_000 }),
		);
	});

	it("says AI is unavailable rather than blaming the caller", async () => {
		process.env.ANTHROPIC_API_KEY = "";
		const app = await build(holder(ORGANIZATION));
		const res = await post(app, { prompt: "go" });

		expect(res.status).toBe(503);
		expect(runAgent).not.toHaveBeenCalled();
	});

	it("refuses a workspace with no organization to bill", async () => {
		const app = await build(holder(null));
		const res = await post(app, { prompt: "go" });

		expect(res.status).toBe(404);
		expect(admitAiSpend).not.toHaveBeenCalled();
		expect(runAgent).not.toHaveBeenCalled();
	});
});
