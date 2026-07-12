import { db, eq } from "@quickengine/db";
import { quickengineSubscriptions } from "@quickengine/db/schema/quickengine";
import { describe, expect, it } from "vitest";
import {
	checkLimit,
	enforce,
	getAccountPlanId,
	getUsage,
	meter,
} from "../src/metering";
import { insertUser } from "./helpers";

// DB-backed engine tests. The usage table isn't FK'd to users, so most tests use
// a bare scopeId string; plan-resolution tests insert a real user + subscription.
describe("metering engine", () => {
	it("increments the actions counter and accumulates", async () => {
		const scope = "acc-actions";
		await meter({ scopeId: scope, meter: "actions", amount: 3 });
		await meter({ scopeId: scope, meter: "actions" }); // default +1
		expect((await checkLimit({ scopeId: scope, meter: "actions" })).used).toBe(
			4,
		);
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

	it("reports ok → warn → over against the Free plan (1000 actions)", async () => {
		const scope = "acc-states";
		await meter({ scopeId: scope, meter: "actions", amount: 799 });
		expect((await checkLimit({ scopeId: scope, meter: "actions" })).state).toBe(
			"ok",
		);
		await meter({ scopeId: scope, meter: "actions", amount: 1 }); // 800
		expect((await checkLimit({ scopeId: scope, meter: "actions" })).state).toBe(
			"warn",
		);
		await meter({ scopeId: scope, meter: "actions", amount: 200 }); // 1000
		const over = await checkLimit({ scopeId: scope, meter: "actions" });
		expect(over.state).toBe("over");
		expect(over.exceeded).toBe(true);
		expect(over.remaining).toBe(0);
	});

	it("enforce allows + records within grace, blocks + doesn't record past the ceiling", async () => {
		const scope = "acc-enforce"; // Free actions = 1000, grace ceiling = 1100
		await meter({ scopeId: scope, meter: "actions", amount: 1050 });
		const graceHit = await enforce({
			scopeId: scope,
			meter: "actions",
			amount: 1,
		});
		expect(graceHit.allowed).toBe(true);
		expect(graceHit.used).toBe(1051);

		await meter({ scopeId: scope, meter: "actions", amount: 60 }); // 1111, past ceiling
		const blocked = await enforce({
			scopeId: scope,
			meter: "actions",
			amount: 1,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.used).toBe(1111); // unchanged — a blocked action isn't counted
	});

	it("counts concurrent increments atomically (no lost writes)", async () => {
		const scope = "acc-concurrent";
		await Promise.all(
			Array.from({ length: 50 }, () =>
				meter({ scopeId: scope, meter: "actions", amount: 1 }),
			),
		);
		expect((await checkLimit({ scopeId: scope, meter: "actions" })).used).toBe(
			50,
		);
	});

	it("resolves the plan from an active subscription, else Free", async () => {
		const scope = "user-plan";
		await insertUser(scope, "plan@example.com");
		expect(await getAccountPlanId(scope)).toBe("free");

		await db
			.insert(quickengineSubscriptions)
			.values({ userId: scope, planId: "pro", status: "active" });
		expect(await getAccountPlanId(scope)).toBe("pro");

		// A canceled subscription falls back to Free.
		await db
			.update(quickengineSubscriptions)
			.set({ status: "canceled" })
			.where(eq(quickengineSubscriptions.userId, scope));
		expect(await getAccountPlanId(scope)).toBe("free");
	});

	it("a higher plan raises the limit (Pro actions = 100k)", async () => {
		const scope = "user-pro-limit";
		await insertUser(scope, "pro-limit@example.com");
		await db
			.insert(quickengineSubscriptions)
			.values({ userId: scope, planId: "pro", status: "active" });
		await meter({ scopeId: scope, meter: "actions", amount: 5000 });
		const check = await checkLimit({ scopeId: scope, meter: "actions" });
		expect(check.limit).toBe(100_000);
		expect(check.state).toBe("ok");
	});

	it("getUsage returns every meter", async () => {
		const usage = await getUsage({ scopeId: "acc-usage" });
		expect(Object.keys(usage).sort()).toEqual([
			"actions",
			"seats",
			"storageBytes",
			"workspaces",
		]);
	});
});
