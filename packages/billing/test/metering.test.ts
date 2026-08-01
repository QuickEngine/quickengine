import { db, eq } from "@quickengine/db";
import { quickengineSubscriptions } from "@quickengine/db/schema/quickengine";
import { describe, expect, it } from "vitest";
import {
	checkAllowance,
	checkLimit,
	enforce,
	getAccountPlanId,
	getUsage,
	meter,
} from "../src/metering";
import { insertOrg } from "./helpers";

// DB-backed engine tests. The usage table isn't FK'd to users, so most tests use
// a bare scopeId string; plan-resolution tests insert a real user + subscription.
describe("metering engine", () => {
	it("increments the actions counter and accumulates", async () => {
		const scope = "acc-actions";
		await meter({ scopeId: scope, meter: "apiRequests", amount: 3 });
		await meter({ scopeId: scope, meter: "apiRequests" }); // default +1
		expect(
			(await checkLimit({ scopeId: scope, meter: "apiRequests" })).used,
		).toBe(4);
	});

	it("SETS a gauge instead of accumulating", async () => {
		const scope = "acc-gauge";
		await meter({ scopeId: scope, meter: "storageBytes", amount: 500 });
		await meter({ scopeId: scope, meter: "storageBytes", amount: 200 });
		// A gauge reflects the latest total, not the sum.
		expect(
			(await checkLimit({ scopeId: scope, meter: "storageBytes" })).used,
		).toBe(200);
	});

	it("reports ok → warn → over against the Free plan (10k API requests)", async () => {
		const scope = "acc-states";
		await meter({ scopeId: scope, meter: "apiRequests", amount: 7_999 });
		expect(
			(await checkLimit({ scopeId: scope, meter: "apiRequests" })).state,
		).toBe("ok");
		await meter({ scopeId: scope, meter: "apiRequests", amount: 1 }); // 8000 → 80%
		expect(
			(await checkLimit({ scopeId: scope, meter: "apiRequests" })).state,
		).toBe("warn");
		await meter({ scopeId: scope, meter: "apiRequests", amount: 2_000 }); // 10000 → at the limit
		const over = await checkLimit({ scopeId: scope, meter: "apiRequests" });
		expect(over.state).toBe("over");
		expect(over.exceeded).toBe(true);
		expect(over.remaining).toBe(0);
	});

	it("enforce allows + records within grace, blocks + doesn't record past the ceiling", async () => {
		const scope = "acc-enforce"; // Free apiRequests = 10_000, grace ceiling = 11_000
		await meter({ scopeId: scope, meter: "apiRequests", amount: 10_500 });
		const graceHit = await enforce({
			scopeId: scope,
			meter: "apiRequests",
			amount: 1,
		});
		expect(graceHit.allowed).toBe(true);
		expect(graceHit.used).toBe(10_501);

		await meter({ scopeId: scope, meter: "apiRequests", amount: 600 }); // 11_101, past ceiling
		const blocked = await enforce({
			scopeId: scope,
			meter: "apiRequests",
			amount: 1,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.used).toBe(11_101); // unchanged — a blocked request isn't counted
	});

	it("enforce treats a gauge amount as the proposed absolute total", async () => {
		const scope = "acc-enforce-gauge";
		await meter({ scopeId: scope, meter: "storageBytes", amount: 500 });
		const result = await enforce({
			scopeId: scope,
			meter: "storageBytes",
			amount: 700,
		});
		expect(result.allowed).toBe(true);
		expect(result.used).toBe(700);
		expect(
			(await checkLimit({ scopeId: scope, meter: "storageBytes" })).used,
		).toBe(700);
	});

	it("can preflight a gauge total without recording bytes that do not exist", async () => {
		const scope = "acc-preflight-gauge";
		await meter({ scopeId: scope, meter: "storageBytes", amount: 500 });
		const result = await checkAllowance({
			scopeId: scope,
			meter: "storageBytes",
			amount: 700,
		});
		expect(result).toMatchObject({ allowed: true, used: 700 });
		expect(
			(await checkLimit({ scopeId: scope, meter: "storageBytes" })).used,
		).toBe(500);
	});

	it("counts concurrent increments atomically (no lost writes)", async () => {
		const scope = "acc-concurrent";
		await Promise.all(
			Array.from({ length: 50 }, () =>
				meter({ scopeId: scope, meter: "apiRequests", amount: 1 }),
			),
		);
		expect(
			(await checkLimit({ scopeId: scope, meter: "apiRequests" })).used,
		).toBe(50);
	});

	it("resolves the plan from an active subscription, else Free", async () => {
		const scope = "00000000-0000-4000-8000-0000000ccf01";
		await insertOrg(scope);
		expect(await getAccountPlanId(scope)).toBe("free");

		await db
			.insert(quickengineSubscriptions)
			.values({ organizationId: scope, planId: "grow", status: "active" });
		expect(await getAccountPlanId(scope)).toBe("grow");

		// A canceled subscription falls back to Free.
		await db
			.update(quickengineSubscriptions)
			.set({ status: "canceled" })
			.where(eq(quickengineSubscriptions.organizationId, scope));
		expect(await getAccountPlanId(scope)).toBe("free");
	});

	it("a higher plan raises the limit (Grow API requests = 1M)", async () => {
		const scope = "00000000-0000-4000-8000-0000000ccf02";
		await insertOrg(scope);
		await db
			.insert(quickengineSubscriptions)
			.values({ organizationId: scope, planId: "grow", status: "active" });
		await meter({ scopeId: scope, meter: "apiRequests", amount: 5000 });
		const check = await checkLimit({ scopeId: scope, meter: "apiRequests" });
		expect(check.limit).toBe(1_000_000);
		expect(check.state).toBe("ok");
	});

	it("getUsage returns every meter", async () => {
		const usage = await getUsage({ scopeId: "acc-usage" });
		// Exhaustive on purpose: a new meter that nothing reports would be invisible
		// on the usage dashboard, so adding one has to break this.
		expect(Object.keys(usage).sort()).toEqual([
			"aiActions",
			"apiRequests",
			"seats",
			"storageBytes",
			"webhookDeliveries",
			"workspaces",
		]);
	});
});
