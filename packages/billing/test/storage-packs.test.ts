import { db, eq } from "@quickengine/db";
import { quickengineSubscriptions } from "@quickengine/db/schema/quickengine";
import { describe, expect, it } from "vitest";
import { getAccountLimits } from "../src/metering";
import {
	getPlanLimits,
	OVERAGE,
	purchasedStorageBytes,
	STORAGE_PACKS,
	storageRebateCents,
} from "../src/plans";
import { insertOrg } from "./helpers";

const GB = 1024 ** 3;

describe("the storage ladder", () => {
	/**
	 * 🔴 The whole reason the ladder is non-linear. If $15 bought three times
	 * what $5 does, there would be no reason to ever buy it instead of three
	 * small packs, and the middle rung would be decoration.
	 */
	it("gets cheaper per gigabyte as it goes up", () => {
		const perGb = STORAGE_PACKS.map((pack) => pack.cents / (pack.bytes / GB));
		for (let i = 1; i < perGb.length; i += 1) {
			expect(perGb[i]).toBeLessThan(perGb[i - 1]);
		}
	});

	/**
	 * ⚠️ The invariant that makes overage safe to meet by accident. If overage
	 * cost MORE than the cheapest pack, somebody who simply used the product
	 * would be paying a penalty for not having predicted their own month.
	 */
	it("never charges more for overage than the smallest pack costs", () => {
		const smallest = STORAGE_PACKS[0];
		const packPerGb = smallest.cents / (smallest.bytes / GB);
		expect(OVERAGE.storageBytes?.cents).toBeLessThanOrEqual(packPerGb);
	});

	it("adds nothing for an unknown pack or a zero quantity", () => {
		expect(purchasedStorageBytes(null, 3)).toBe(0);
		expect(purchasedStorageBytes("small", 0)).toBe(0);
		// A pack id that is no longer on the ladder must stop granting storage
		// rather than granting it forever because a row still names it.
		expect(purchasedStorageBytes("enormous", 2)).toBe(0);
	});
});

describe("the cheaper-of-pack-or-overage rule", () => {
	/**
	 * 🔴 The exact case the rule exists for. The large pack is 3 cents a
	 * gigabyte and overage is 5, so 500 GB of pack costs $15 while the 200 GB
	 * actually used would have cost $10 as overage. Without a rebate the
	 * customer is punished for committing.
	 */
	it("refunds the difference when a pack cost more than drifting would", () => {
		const rebate = storageRebateCents({
			packId: "large",
			quantity: 1,
			bytesOverPlan: 200 * GB,
		});
		// $15 paid, $10 of real usage, $5 back.
		expect(rebate).toBe(500);
	});

	it("charges nothing back when the pack was the cheaper choice", () => {
		// 400 GB at 5 cents is $20, against $15 for the pack. The pack won.
		expect(
			storageRebateCents({
				packId: "large",
				quantity: 1,
				bytesOverPlan: 400 * GB,
			}),
		).toBe(0);
	});

	it("returns the whole pack when none of it was used", () => {
		expect(
			storageRebateCents({ packId: "large", quantity: 1, bytesOverPlan: 0 }),
		).toBe(1_500);
	});

	it("never credits more than the packs cost", () => {
		const rebate = storageRebateCents({
			packId: "small",
			quantity: 2,
			bytesOverPlan: 0,
		});
		expect(rebate).toBe(1_000);
		expect(rebate).toBeLessThanOrEqual(2 * 500);
	});

	/**
	 * ⚠️ The small pack is priced at EXACTLY the overage rate, so it can never
	 * produce a rebate at any usage. That equality is deliberate and this is what
	 * would notice if somebody changed one of the two numbers.
	 */
	it("produces no rebate for the small pack once it is full", () => {
		expect(
			storageRebateCents({
				packId: "small",
				quantity: 1,
				bytesOverPlan: 100 * GB,
			}),
		).toBe(0);
	});
});

describe("purchased storage in the enforced limits", () => {
	it("stacks on top of the plan allowance", async () => {
		const orgId = "11111111-1111-4111-8111-111111111111";
		await insertOrg(orgId);
		await db.insert(quickengineSubscriptions).values({
			organizationId: orgId,
			planId: "commerce",
			status: "active",
			storagePackId: "medium",
			storagePackQuantity: 2,
		});

		const { limits } = await getAccountLimits(orgId);
		const plan = getPlanLimits("commerce").storageBytes;
		if (plan === null) throw new Error("Commerce must cap storage");
		// 100 GB of plan plus two 250 GB packs.
		expect(limits.storageBytes).toBe(plan + 500 * GB);
	});

	/**
	 * 🔴 Packs are an add-on to a LIVE subscription. A lapsed account past its
	 * grace loses the plan, so it must lose the add-on with it, or somebody who
	 * stopped paying keeps the storage they stopped paying for.
	 */
	it("is dropped along with the plan when the subscription lapses", async () => {
		const orgId = "22222222-2222-4222-8222-222222222222";
		await insertOrg(orgId);
		await db.insert(quickengineSubscriptions).values({
			organizationId: orgId,
			planId: "commerce",
			status: "canceled",
			// Well outside the seven day lapse grace.
			currentPeriodEndsAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
			storagePackId: "large",
			storagePackQuantity: 1,
		});

		const { planId, limits } = await getAccountLimits(orgId);
		expect(planId).toBe("free");
		expect(limits.storageBytes).toBe(getPlanLimits("free").storageBytes);
	});

	it("leaves an unlimited allowance unlimited", async () => {
		const orgId = "33333333-3333-4333-8333-333333333333";
		await insertOrg(orgId);
		await db.insert(quickengineSubscriptions).values({
			organizationId: orgId,
			planId: "enterprise",
			status: "active",
			storagePackId: "large",
			storagePackQuantity: 4,
		});

		const { limits } = await getAccountLimits(orgId);
		expect(limits.storageBytes).toBeNull();
	});

	it("ignores a half-written row rather than guessing", async () => {
		const orgId = "44444444-4444-4444-8444-444444444444";
		await insertOrg(orgId);
		await db.insert(quickengineSubscriptions).values({
			organizationId: orgId,
			planId: "commerce",
			status: "active",
			// A quantity with no pack names nothing, so it grants nothing.
			storagePackId: null,
			storagePackQuantity: 5,
		});

		const { limits } = await getAccountLimits(orgId);
		expect(limits.storageBytes).toBe(getPlanLimits("commerce").storageBytes);
		await db
			.delete(quickengineSubscriptions)
			.where(eq(quickengineSubscriptions.organizationId, orgId));
	});
});
