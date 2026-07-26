import type { Context } from "hono";
import type { PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

/**
 * Gate a request against the account's included usage.
 *
 * **Why this runs inside authorization rather than as a global middleware.** The
 * account to charge is only known once a credential has resolved and a workspace
 * has been authorized. Anything earlier has nobody to bill; anything later has
 * already done the work. `authorizeWorkspace` is the single place every route
 * passes through with that context in hand.
 *
 * **This replaces the post-hoc metering added in 9.4.** Counting after the fact
 * measured usage but could never prevent it, and running both would double-count
 * every request. `enforce()` records when it allows, so this is one call that both
 * counts and gates.
 *
 * **Soft enforcement, per the engine's design.** Warn at 80%, allow overage up to a
 * 10% grace ceiling, and only refuse once past it. The request that tips an account
 * over is allowed through — being cut off mid-operation is how data gets left
 * half-written, and the goodwill cost of that vastly exceeds the few cents of
 * overage. Anything already in flight never re-checks.
 */

export type UsageDecision = {
	allowed: boolean;
	state: "ok" | "warn" | "over";
	used: number;
	limit: number | null;
	remaining: number | null;
	/** Which plan's limits applied. Rate limiting reads this rather than looking it up again. */
	planId?: string;
};

export type UsageEnforcer = (input: {
	scopeId: string;
	meter: "apiRequests";
	amount: number;
}) => Promise<UsageDecision>;

/** Headers so a client can see it approaching a wall before hitting one. */
export const USAGE_HEADERS = {
	limit: "X-Usage-Limit",
	remaining: "X-Usage-Remaining",
	state: "X-Usage-State",
	used: "X-Usage-Used",
} as const;

function applyHeaders(c: Context<PlatformEnv>, decision: UsageDecision): void {
	c.header(USAGE_HEADERS.state, decision.state);
	c.header(USAGE_HEADERS.used, String(decision.used));
	if (decision.limit !== null) {
		c.header(USAGE_HEADERS.limit, String(decision.limit));
	}
	if (decision.remaining !== null) {
		c.header(USAGE_HEADERS.remaining, String(Math.max(0, decision.remaining)));
	}
}

/**
 * Returns a rejection response when the account is past its ceiling, or
 * `undefined` to let the request continue.
 *
 * A failure inside the usage store **allows the request**. Metering is bookkeeping;
 * refusing a customer's traffic because our own counter is unavailable would turn a
 * billing outage into a product outage, and under-counting is the cheaper mistake by
 * a wide margin.
 */
export async function enforceUsage(
	c: Context<PlatformEnv>,
	enforcer: UsageEnforcer | undefined,
	/**
	 * The **organization** id, not the owning user's.
	 *
	 * Every other part of the billing layer is org-scoped — `getUsage` and
	 * `getAccountPlanId` are both called with an org id by the account app's usage
	 * page. Metering against the owner instead would write usage under a key
	 * nothing reads: the dashboard would show zero forever while the counter
	 * quietly accumulated somewhere else, and no limit would ever trigger.
	 *
	 * `undefined` when a workspace has no organization. Such a workspace cannot be
	 * metered coherently, so it is left ungated rather than billed to a scope no
	 * one can see.
	 */
	scopeId: string | null | undefined,
	logger?: { error(message: string, context?: Record<string, unknown>): void },
): Promise<Response | undefined> {
	if (!enforcer || !scopeId) return undefined;

	let decision: UsageDecision;
	try {
		decision = await enforcer({ scopeId, meter: "apiRequests", amount: 1 });
	} catch (error) {
		logger?.error("usage.enforcement_failed", {
			requestId: c.get("requestId"),
			route: c.req.routePath || "unmatched",
			error,
		});
		return undefined;
	}

	// Published for the rate limiter, which scales its policy by plan. Resolved
	// here already, so looking it up again would be a second query for an answer
	// we are holding.
	if (decision.planId) c.set("planId", decision.planId);
	applyHeaders(c, decision);
	if (decision.allowed) return undefined;

	return respondError(
		c,
		"USAGE_LIMIT_EXCEEDED",
		"This account has used all of its included requests for the current period.",
		402,
	);
}
