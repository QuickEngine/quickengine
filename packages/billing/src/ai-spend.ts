import {
	creditBalanceMicros,
	recordCreditEntry,
	workspaceSpendMicros,
} from "@quickengine/db";
import { checkAllowance, meter } from "./metering";

/**
 * Admission control for AI spend.
 *
 * **Everything here happens before a run starts.** Nothing in this file can stop
 * work already in flight — a request that was admitted always finishes, and the
 * limits apply to the *next* one. Cutting off a half-finished prompt hands the
 * user a broken operation at the worst possible moment, and a bounded overage is
 * cheaper than that.
 *
 * What makes that safe is that the worst case of an admitted run is a number we
 * choose rather than whatever the customer typed:
 *
 * - `maxCostMicros` bounds the run's total spend, checked between steps.
 * - `maxOutputTokens` becomes the provider's hard output ceiling.
 * - `maxInputTokens` refuses an oversized prompt **at the door**, before a single
 *   token is bought — which is a refusal, not a cancellation, so the rule above
 *   still holds.
 *
 * Without that last one, someone watching their balance run down could submit one
 * enormous final prompt knowing in-flight work always completes. The ceiling is
 * what makes "always finishes" affordable.
 */

/** 1,000,000 micros = $1. Matches `costMicros` in `@quickengine/agent-core`. */
export const MICROS_PER_DOLLAR = 1_000_000;

/**
 * The most any single run may cost, regardless of balance.
 *
 * Applies even to an account with plenty of credit: it bounds a runaway loop, a
 * pathological prompt, and the deliberate last-gasp request alike. Config, so it
 * can be tuned without a deploy touching this logic.
 */
export const MAX_RUN_COST_MICROS = Number(
	process.env.AI_MAX_RUN_COST_MICROS ?? 50_000,
);

/**
 * The most one workspace may spend in a rolling window.
 *
 * Separate from the balance and non-negotiable: we settle with the model provider
 * in arrears while customers spend a prepaid balance, so a single compromised or
 * runaway workspace must not be able to drain an account faster than we can react.
 */
export const WORKSPACE_CAP_MICROS = Number(
	process.env.AI_WORKSPACE_CAP_MICROS ?? 5 * MICROS_PER_DOLLAR,
);

export const WORKSPACE_CAP_WINDOW_MS = Number(
	process.env.AI_WORKSPACE_CAP_WINDOW_MS ?? 24 * 60 * 60 * 1000,
);

export type AiAdmission =
	| {
			allowed: true;
			/**
			 * Who pays for this run.
			 *
			 * `plan` — inside the AI allowance the subscription already bought. Costs
			 * the customer nothing extra and writes no ledger entry.
			 * `credits` — the allowance is spent, so this draws on prepaid balance.
			 */
			fundedBy: "plan" | "credits";
			/** The ceiling this run must be given. Never exceeds `MAX_RUN_COST_MICROS`. */
			maxCostMicros: number;
			balanceMicros: number;
	  }
	| {
			allowed: false;
			reason: "no_balance" | "workspace_cap";
			balanceMicros: number;
			/** What the caller should tell the user to do about it. */
			message: string;
	  };

/**
 * Decide whether a run may start, and how much it may spend if so.
 *
 * The returned ceiling is the *smallest* of what the customer can afford, what one
 * run is ever allowed to cost, and what the workspace has left under its cap. A
 * run is admitted with that ceiling and then always allowed to finish inside it.
 */
export async function admitAiSpend(input: {
	organizationId: string;
	workspaceId: string;
	now?: Date;
}): Promise<AiAdmission> {
	const now = input.now ?? new Date();

	// The workspace cap applies to everyone, including runs the subscription
	// already covers. It bounds blast radius — a compromised or looping workspace
	// must not be able to burn a whole plan allowance in an afternoon.
	const spentMicros = await workspaceSpendMicros(
		input.workspaceId,
		new Date(now.getTime() - WORKSPACE_CAP_WINDOW_MS),
	);
	const capRemaining = WORKSPACE_CAP_MICROS - spentMicros;

	// The subscription is checked FIRST and credits are strictly overage. Charging
	// credit while a paid allowance sits unused would bill the same customer twice
	// for the thing they already bought.
	const allowance = await checkAllowance({
		scopeId: input.organizationId,
		meter: "aiActions",
	});

	if (allowance.allowed) {
		if (capRemaining <= 0) {
			return {
				allowed: false,
				reason: "workspace_cap",
				balanceMicros: await creditBalanceMicros(input.organizationId),
				message:
					"This workspace has reached its daily AI limit. It resets automatically, or you can raise the limit in settings.",
			};
		}
		return {
			allowed: true,
			fundedBy: "plan",
			balanceMicros: await creditBalanceMicros(input.organizationId),
			maxCostMicros: Math.min(MAX_RUN_COST_MICROS, capRemaining),
		};
	}

	// Allowance spent. Prepaid credit is what keeps them running.
	const balanceMicros = await creditBalanceMicros(input.organizationId);
	if (balanceMicros <= 0) {
		return {
			allowed: false,
			reason: "no_balance",
			balanceMicros,
			message:
				"You have used your plan's included AI actions. Top up credits or upgrade to keep going.",
		};
	}
	if (capRemaining <= 0) {
		return {
			allowed: false,
			reason: "workspace_cap",
			balanceMicros,
			message:
				"This workspace has reached its daily AI limit. It resets automatically, or you can raise the limit in settings.",
		};
	}

	return {
		allowed: true,
		fundedBy: "credits",
		balanceMicros,
		maxCostMicros: Math.min(balanceMicros, MAX_RUN_COST_MICROS, capRemaining),
	};
}

/**
 * Record what a finished run actually cost, against whoever paid for it.
 *
 * Called **after** the run with real usage rather than the estimate, so the record
 * reflects what happened rather than what was budgeted.
 *
 * `fundedBy` decides where it lands, and it must be exactly one of the two:
 *
 * - `plan` — increments the `aiActions` counter. **No ledger entry**, because the
 *   subscription already paid for it. Writing one would charge twice.
 * - `credits` — writes a negative ledger row and leaves the counter alone, since
 *   the allowance it would count against is already spent.
 *
 * **Each source carries its own bound**, which is why plan-funded runs need no
 * ledger row: they are limited by the plan's own `aiActions` allowance, a number
 * the customer bought and we can forecast. Credit-funded runs are the ones the
 * workspace cap exists for, because those are bounded only by a balance the
 * customer can top up at will.
 *
 * The balance can legitimately go slightly negative on the credit path: the
 * admitted ceiling is checked between steps, so a final step can carry the total
 * just past it. That overage is bounded by one step and is the deliberate price of
 * never killing work in flight.
 */
export async function recordAiSpend(input: {
	organizationId: string;
	workspaceId: string;
	costMicros: number;
	fundedBy?: "plan" | "credits";
	agentRunId?: string | null;
	description?: string | null;
}) {
	if (input.costMicros <= 0) return undefined;

	if (input.fundedBy === "plan") {
		// Counter only, no ledger row. The subscription already paid for this, and a
		// row of zero would sum to nothing anyway — it would look like a record of
		// something while recording nothing.
		await meter({ scopeId: input.organizationId, meter: "aiActions" });
		return undefined;
	}

	return await recordCreditEntry({
		organizationId: input.organizationId,
		workspaceId: input.workspaceId,
		kind: "spend",
		amountMicros: -input.costMicros,
		agentRunId: input.agentRunId ?? null,
		description: input.description ?? "AI usage",
	});
}
