import {
	admitAiSpend,
	MAX_RUN_COST_MICROS,
	MICROS_PER_DOLLAR,
	meter,
	recordAiSpend,
	WORKSPACE_CAP_MICROS,
} from "@quickengine/billing";
import { creditBalanceMicros, recordTopUp } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "ai-owner";
const orgId = "00000000-0000-4000-8000-0000000d0001";
const workspaceId = "00000000-0000-4000-8000-0000000d0010";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000d0011";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'AI Owner', 'ai@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, is_personal, owner_id)
		values (${orgId}, 'AI Org', 'ai-org', false, ${ownerId})
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, ${orgId}, 'AI WS', 'ecommerce'),
			(${otherWorkspaceId}, ${ownerId}, ${orgId}, 'Other AI WS', 'ecommerce')
	`;
});

/**
 * Spend the plan's included AI allowance.
 *
 * The free plan includes 25 actions and enforcement allows a 10% grace ceiling on
 * top, so this goes comfortably past both. Only once this is exhausted should
 * anything touch prepaid credit.
 */
const exhaustPlanAllowance = () =>
	meter({ scopeId: orgId, meter: "aiActions", amount: 100 });

const topUp = (dollars: number, id: string) =>
	recordTopUp({
		organizationId: orgId,
		amountMicros: dollars * MICROS_PER_DOLLAR,
		stripePaymentIntentId: id,
	});

describe("admitting AI spend", () => {
	it("uses the plan's included allowance before touching credits", async () => {
		// The subscription already paid for these. Charging credit while a paid
		// allowance sits unused would bill the same customer twice.
		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });

		expect(decision.allowed).toBe(true);
		if (!decision.allowed) return;
		expect(decision.fundedBy).toBe("plan");
	});

	it("falls back to credits only once the allowance is spent", async () => {
		await exhaustPlanAllowance();
		await topUp(10, "pi_ai_overage");

		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });
		expect(decision.allowed).toBe(true);
		if (!decision.allowed) return;
		expect(decision.fundedBy).toBe("credits");
	});

	it("refuses only when the allowance is spent AND there is no credit", async () => {
		await exhaustPlanAllowance();

		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });
		expect(decision.allowed).toBe(false);
		if (decision.allowed) return;
		expect(decision.reason).toBe("no_balance");
		// The refusal has to offer the way out, not just deny.
		expect(decision.message).toMatch(/Top up|upgrade/i);
	});

	it("caps a single run even when the balance is enormous", async () => {
		await exhaustPlanAllowance();
		// The abuse case: plenty of credit is not permission to spend it all at once
		// in one runaway loop or one pathological prompt.
		await topUp(500, "pi_ai_rich");
		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });

		expect(decision.allowed).toBe(true);
		if (!decision.allowed) return;
		expect(decision.maxCostMicros).toBe(MAX_RUN_COST_MICROS);
	});

	it("never admits a run for more than the customer can afford", async () => {
		await exhaustPlanAllowance();
		// The last-gasp case: a tiny balance must produce a tiny ceiling, so the
		// "in-flight always finishes" guarantee cannot be used to overspend.
		const crumbs = 1_000;
		await recordTopUp({
			organizationId: orgId,
			amountMicros: crumbs,
			stripePaymentIntentId: "pi_ai_crumbs",
		});
		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });

		expect(decision.allowed).toBe(true);
		if (!decision.allowed) return;
		expect(decision.maxCostMicros).toBe(crumbs);
	});

	it("stops a workspace that has burned through its cap", async () => {
		await topUp(500, "pi_ai_capped");
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: WORKSPACE_CAP_MICROS,
		});

		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });
		expect(decision.allowed).toBe(false);
		if (decision.allowed) return;
		expect(decision.reason).toBe("workspace_cap");
	});

	it("caps each workspace independently", async () => {
		// One workspace exhausting itself must not lock the whole organization out
		// — the cap bounds blast radius, it is not an account-wide kill switch.
		await topUp(500, "pi_ai_independent");
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: WORKSPACE_CAP_MICROS,
		});

		const blocked = await admitAiSpend({ organizationId: orgId, workspaceId });
		const other = await admitAiSpend({
			organizationId: orgId,
			workspaceId: otherWorkspaceId,
		});

		expect(blocked.allowed).toBe(false);
		expect(other.allowed).toBe(true);
	});

	it("lets a workspace run again once the window has moved on", async () => {
		await topUp(500, "pi_ai_window");
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: WORKSPACE_CAP_MICROS,
		});

		// A day later the same spend is outside the window and no longer counts.
		const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
		const decision = await admitAiSpend({
			organizationId: orgId,
			workspaceId,
			now: tomorrow,
		});

		expect(decision.allowed).toBe(true);
	});

	it("takes the smallest of the three ceilings", async () => {
		await exhaustPlanAllowance();
		await topUp(500, "pi_ai_smallest");
		// Leave less cap headroom than a single run is otherwise allowed.
		const headroom = Math.floor(MAX_RUN_COST_MICROS / 4);
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: WORKSPACE_CAP_MICROS - headroom,
		});

		const decision = await admitAiSpend({ organizationId: orgId, workspaceId });
		expect(decision.allowed).toBe(true);
		if (!decision.allowed) return;
		expect(decision.maxCostMicros).toBe(headroom);
	});
});

describe("recording AI spend", () => {
	it("draws the real cost down from the balance", async () => {
		await topUp(10, "pi_ai_drawdown");
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: 3 * MICROS_PER_DOLLAR,
			agentRunId: "run-1",
		});

		expect(await creditBalanceMicros(orgId)).toBe(7 * MICROS_PER_DOLLAR);
	});

	it("writes nothing for a run that cost nothing", async () => {
		await topUp(10, "pi_ai_free");
		const entry = await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: 0,
		});

		expect(entry).toBeUndefined();
		expect(await creditBalanceMicros(orgId)).toBe(10 * MICROS_PER_DOLLAR);
	});

	it("ties the charge to the run that caused it", async () => {
		// A disputed charge has to be traceable to a specific run, not argued about
		// in the abstract.
		const sql = testDbClient();
		await topUp(10, "pi_ai_traceable");
		await recordAiSpend({
			organizationId: orgId,
			workspaceId,
			costMicros: 500,
			agentRunId: "run-traceable",
		});

		const [row] = await sql`
			select agent_run_id, workspace_id from quickengine_credit_entries
			where kind = 'spend' and organization_id = ${orgId}
		`;
		expect(row?.agent_run_id).toBe("run-traceable");
		expect(row?.workspace_id).toBe(workspaceId);
	});
});
