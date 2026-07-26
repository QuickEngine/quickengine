import type { MiddlewareHandler } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Count API requests against the account that made them.
 *
 * **Why request volume and not something else.** A headless backend's cost curve
 * *is* request volume — it drives database reads, connection pressure, and
 * serverless invocations. It is also the one thing Hard rule 7 unambiguously
 * permits charging for: it is our infrastructure cost, not the customer's earned
 * outcome. Creating an invoice is never billable; serving ten thousand API calls
 * costs real money.
 *
 * **What counts, and why the rule is what it is.** Only requests that reached an
 * authorized context. That single condition does all the work:
 *
 * - `/health`, `/ready`, `/version`, and `/openapi.json` never authorize, so they
 *   are excluded automatically.
 * - A rejected credential never authorizes, so **failed authentication is free**.
 *   Billing someone for being turned away is indefensible, and it would let anyone
 *   run up a stranger's usage by guessing keys at their workspace.
 * - Inngest callbacks are our own control plane and carry no workspace context.
 *
 * A path allowlist would drift the moment a route was added. Deriving it from
 * authorization cannot.
 *
 * **This measures. It does not gate.** No limit is enforced here — enforcement is a
 * later slice, and it deliberately waits until there is real data to set limits
 * from. Recording usage nobody is charged for is the point: the numbers are what
 * make the free tier's ceiling an informed decision rather than a guess.
 */

export type UsageRecorder = (input: {
	scopeId: string;
	meter: "actions";
	amount: number;
}) => Promise<void>;

export function createUsageMetering(options: {
	/** Injected in tests; production passes `meter` from `@quickengine/billing`. */
	record: UsageRecorder;
	logger?: ApiLogger;
	/** Off by default so local development and tests do not accumulate usage. */
	enabled?: boolean;
}): MiddlewareHandler<PlatformEnv> {
	return async (c, next) => {
		await next();

		if (options.enabled === false) return;

		// Set only once a credential resolved and a workspace was authorized. Absent
		// for health checks, unauthenticated probes, and rejected credentials.
		const authorized = c.get("authorized");
		if (!authorized) return;

		const scopeId = authorized.workspace.ownerId;
		if (!scopeId) return;

		try {
			await options.record({ scopeId, meter: "actions", amount: 1 });
		} catch (error) {
			// Metering is bookkeeping. A customer's request has already succeeded by
			// this point, and losing a count must never turn that into a failure —
			// under-billing is recoverable, breaking a working API call is not.
			options.logger?.error("usage.metering_failed", {
				requestId: c.get("requestId"),
				route: c.req.routePath || "unmatched",
				error,
			});
		}
	};
}
