import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * Agent runs — the door the harness never had.
 *
 * 🔴 `packages/agent-core` and `packages/agent-runtime` were complete, exported
 * and tested, and `runAgent` had ZERO callers and no route anywhere in 285
 * endpoints. A finished subsystem nothing could invoke. This is the entry point,
 * and it is deliberately narrow: one synchronous run, bounded, paid for before
 * it starts.
 *
 * ── The money path, which is the whole reason this is careful ────────────────
 *
 * A run costs real money the moment it begins, so the order is: admit, run,
 * record. `admitAiSpend` decides whether the plan allowance covers it or prepaid
 * credits must, and returns the ceiling the run is given. `recordAiSpend` then
 * draws down what was actually used.
 *
 * ⚠️ Spend is recorded even when the run FAILS. Tokens spent before an error are
 * still billed by the model provider, and not recording them would mean the
 * customer's balance quietly disagrees with what we were charged. A failed run
 * that cost nothing records nothing, because `recordAiSpend` ignores zero.
 */
const runSchema = z.object({
	prompt: z.string().trim().min(1).max(4000),
	/** Bounded by the caller, then bounded again by admission. */
	maxSteps: z.number().int().min(1).max(12).default(6),
});

export function registerAgentRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProviderLike;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const access = authorizeWorkspace(options.platform, {
		keyCapability: "agents:run",
		sessionCapability: "records.write",
	});
	const limit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "agents.run",
	});

	app.post("/v1/agents/runs", access, limit, async (c) => {
		const input = runSchema.parse(await c.req.json());
		const { workspaceId, workspace, auditActor } = c.get("authorized");
		const organizationId = workspace.organizationId;
		if (!organizationId) {
			// A workspace with no organization has no subscription and no balance,
			// so there is nothing to charge a run against.
			return respondError(
				c,
				"WORKSPACE_NOT_FOUND",
				"That workspace is not attached to an organization.",
				404,
			);
		}

		const [{ admitAiSpend, recordAiSpend }, { runAgent }, providers, tools] =
			await Promise.all([
				import("@quickengine/billing"),
				import("@quickengine/agent-runtime"),
				import("@quickengine/agent-providers"),
				import("@quickengine/agent-tools-quickdash"),
			]);

		const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
		if (!apiKey) {
			// 🔴 Not an error the customer caused. Saying "AI is unavailable" is
			// honest; a 500 would send them looking for a fault of their own.
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"AI is not available in this environment yet.",
				503,
			);
		}

		const admission = await admitAiSpend({ organizationId, workspaceId });
		if (!admission.allowed) {
			return respondError(
				c,
				admission.reason === "no_balance"
					? "PLAN_UPGRADE_REQUIRED"
					: "USAGE_LIMIT_EXCEEDED",
				admission.message,
				402,
			);
		}

		const runId = crypto.randomUUID();
		// 🔴 `runAgent` can THROW rather than return a failed result, and the
		// comment at the top of this file promises spend is recorded either way.
		// Without this the promise was false: a provider error mid-run would
		// skip the drawdown entirely and the customer would keep an allowance we
		// had already been billed for. `settled` guards against recording twice.
		let settled = false;
		const settle = async (costMicros: number) => {
			if (settled) return;
			settled = true;
			await recordAiSpend({
				organizationId,
				workspaceId,
				costMicros,
				fundedBy: admission.fundedBy,
				agentRunId: runId,
				description: "Agent run",
			});
		};

		let result: Awaited<ReturnType<typeof runAgent>>;
		try {
			result = await runAgent({
				runId,
				prompt: input.prompt,
				scope: {
					// The audit actor always has an id on an authorized request; the
					// fallback exists only to satisfy the nullable type.
					actorId: auditActor.id ?? "system",
					organizationId,
					// Exactly the workspace this request authorized, and no other.
					workspaceGrants: [{ workspaceId, access: "read" }],
					allowedProducts: ["quickdash"],
				},
				budget: {
					maxSteps: input.maxSteps,
					maxInputTokens: 60_000,
					maxOutputTokens: 4_000,
					// The ceiling admission decided, never the caller's wish.
					maxCostMicros: admission.maxCostMicros,
					maxDurationMs: 60_000,
				},
				provider: providers.createAnthropicTextProvider({ apiKey }),
				tools: tools.createQuickDashDiscoveryTools(
					tools.createDatabaseQuickDashAgentRepository(),
				),
				audit: {
					async record(event) {
						options.logger.info("agent.audit", {
							runId,
							workspaceId,
							event: event.type,
						});
					},
				},
			});
		} catch (error) {
			// The run is gone, but whatever it burned before dying is real. We
			// cannot read the usage off a throw, so charge the ceiling that was
			// admitted rather than nothing: under-charging here is a hole any
			// caller could drive through by making runs fail on purpose.
			await settle(admission.maxCostMicros);
			throw error;
		}

		const costMicros = "usage" in result ? (result.usage.costMicros ?? 0) : 0;
		await settle(costMicros);

		return respond(c, {
			runId,
			status: result.status,
			content: "content" in result ? result.content : null,
			reason: "reason" in result ? result.reason : null,
			fundedBy: admission.fundedBy,
			costMicros,
		});
	});
}

/** Structural, so this file does not depend on the cache package's shape. */
type CacheProviderLike = Parameters<typeof createRateLimit>[0]["cache"];
