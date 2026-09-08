import { db } from "@quickengine/db";
import {
	quickengineSubscriptions,
	quickengineUsage,
} from "@quickengine/db/schema/quickengine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertOrg } from "./helpers";

/**
 * The monthly run that turns usage into money.
 *
 * 🔴 Before this existed, every part of the pricing model was built and nothing
 * charged anybody. These tests exist to keep it that way round: they assert that
 * a bill is produced, that a paying customer is never billed for their own
 * orders, that a free account's bill is bounded, and that the month billed is
 * the one that CLOSED.
 */
const invoiceItemsCreate = vi.fn(async () => ({ id: "ii_mock" }));

vi.mock("../src/stripe", () => ({
	getStripe: () => ({ invoiceItems: { create: invoiceItemsCreate } }),
	isStripeConfigured: () => true,
}));

const { billAccountUsage } = await import("../src/usage-billing");
const { FREE_OVERAGE_CAP_CENTS } = await import("../src/plans");

const GB = 1024 ** 3;
// A fixed "now" so the closed month is never ambiguous at a month boundary.
const NOW = new Date("2026-03-05T04:00:00.000Z");
const CLOSED = new Date(Date.UTC(2026, 1, 1)); // February 2026
const OPEN = new Date(Date.UTC(2026, 2, 1)); // March 2026, still running
const SENTINEL = new Date(0);

let seq = 0;
const nextOrgId = (): string => {
	seq += 1;
	return `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

async function account(planId: string, extra: Record<string, unknown> = {}) {
	const organizationId = nextOrgId();
	await insertOrg(organizationId);
	await db.insert(quickengineSubscriptions).values({
		organizationId,
		planId: planId as never,
		status: "active",
		stripeCustomerId: `cus_${organizationId.slice(0, 8)}`,
		...extra,
	});
	return organizationId;
}

async function usage(
	scopeId: string,
	meter: string,
	value: number,
	periodStart: Date,
) {
	await db.insert(quickengineUsage).values({
		scopeId,
		meter: meter as never,
		periodStart,
		periodEnd: new Date(periodStart.getTime() + 86_400_000),
		value,
	});
}

beforeEach(() => {
	invoiceItemsCreate.mockClear();
});

describe("billing a closed month", () => {
	it("charges a paid account for the infrastructure it used", async () => {
		const org = await account("commerce");
		// Commerce includes 1,000,000 requests. 30,000 over is three blocks at $1.
		await usage(org, "apiRequests", 1_030_000, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.period).toBe("2026-02");
		expect(bill.chargedCents).toBe(300);
		expect(bill.lines).toHaveLength(1);
		expect(bill.lines[0]?.label).toBe("API requests");
		expect(invoiceItemsCreate).toHaveBeenCalledTimes(1);
	});

	/**
	 * 🔴 The promise the whole ladder is built on. A paying customer is never
	 * charged for the business they built, so orders past any number cost them
	 * nothing. Commerce leaves `ordersPerMonth` uncapped, so there is not even an
	 * allowance to exceed.
	 */
	it("never charges a paying customer for their own orders", async () => {
		const org = await account("commerce");
		await usage(org, "ordersPerMonth", 50_000, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.lines).toHaveLength(0);
		expect(bill.chargedCents).toBe(0);
		expect(invoiceItemsCreate).not.toHaveBeenCalled();
	});

	it("charges a free account per record past its allowance", async () => {
		const org = await account("free");
		// Free includes 25 bookings; 10 over at 25 cents is $2.50.
		await usage(org, "bookingsPerMonth", 35, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.chargedCents).toBe(250);
		expect(bill.lines[0]?.meter).toBe("bookingsPerMonth");
	});

	/**
	 * ⚠️ The reason the run is monthly and reads backwards. Reading the CURRENT
	 * period on the first of the month would bill a customer for the few hours of
	 * the new month that had elapsed and let the whole closed month go free.
	 */
	it("ignores usage in the month that is still running", async () => {
		const org = await account("free");
		await usage(org, "bookingsPerMonth", 500, OPEN);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.lines).toHaveLength(0);
		expect(invoiceItemsCreate).not.toHaveBeenCalled();
	});
});

describe("the free spend cap", () => {
	/**
	 * 🔴 Nobody on a free tier may run up an unbounded bill from one good month.
	 * A thousand orders past the allowance is $250 at 25 cents; the cap stops it
	 * below the price of the plan that would have made them all free.
	 */
	it("clips a free account's bill at the cap", async () => {
		const org = await account("free");
		await usage(org, "ordersPerMonth", 1_025, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.chargedCents).toBe(FREE_OVERAGE_CAP_CENTS);
		expect(bill.capped).toBe(true);
	});

	/**
	 * ⚠️ Which meters survive the clipping is not arbitrary. Storage, AI and
	 * email are invoices we have already been sent by Cloudflare, Anthropic and
	 * Resend; records cost us nothing to hold. If the cap bites, cost recovery
	 * comes first.
	 */
	it("recovers real infrastructure costs before record fees", async () => {
		const org = await account("free");
		// 100 GB over at 5 cents a gigabyte is $5, and should be billed in full.
		await usage(org, "storageBytes", 102 * GB, SENTINEL);
		await usage(org, "ordersPerMonth", 1_025, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		const storage = bill.lines.find((line) => line.meter === "storageBytes");
		expect(storage?.cents).toBe(500);
		expect(bill.chargedCents).toBe(FREE_OVERAGE_CAP_CENTS);
		expect(bill.capped).toBe(true);
	});

	it("does not cap a paying customer", async () => {
		const org = await account("commerce");
		// 2,000,000 requests over the million included is $200, well past the cap.
		await usage(org, "apiRequests", 3_000_000, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.chargedCents).toBe(20_000);
		expect(bill.capped).toBe(false);
	});
});

describe("the storage rebate", () => {
	/**
	 * 🔴 The customer must never be worse off for buying ahead. A large pack is
	 * $15 for 500 GB; using 200 GB of it would have cost $10 as overage, so $5
	 * comes back as a credit on the same invoice.
	 */
	it("credits back the difference when a pack cost more than overage", async () => {
		const org = await account("commerce", {
			storagePackId: "large",
			storagePackQuantity: 1,
		});
		// Commerce includes 100 GB, so 300 GB stored is 200 GB over the plan.
		await usage(org, "storageBytes", 300 * GB, SENTINEL);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.rebateCents).toBe(500);
		// The credit is the only line: 300 GB is inside 100 GB of plan plus the
		// 500 GB pack, so no overage is owed at all.
		expect(bill.lines).toHaveLength(0);
		expect(bill.chargedCents).toBe(-500);
		const [[item]] = invoiceItemsCreate.mock.calls as unknown as [
			[{ amount: number }],
		];
		expect(item.amount).toBeLessThan(0);
	});

	it("credits nothing when the pack was the cheaper choice", async () => {
		const org = await account("commerce", {
			storagePackId: "large",
			storagePackQuantity: 1,
		});
		// 500 GB over the plan would have cost $25 as overage against $15 paid.
		await usage(org, "storageBytes", 600 * GB, SENTINEL);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.rebateCents).toBe(0);
	});
});

describe("emails", () => {
	it("charges every tier for mail past the allowance", async () => {
		const org = await account("commerce");
		// Commerce includes 10,000. Three thousand over is three blocks at $1.
		await usage(org, "emailsSent", 13_000, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.lines[0]?.meter).toBe("emailsSent");
		expect(bill.chargedCents).toBe(300);
	});

	/**
	 * ⚠️ Blocks of a thousand, so a busy fortnight does not produce a surprise
	 * line. Nine hundred over is inside the block and costs nothing.
	 */
	it("charges nothing inside a block", async () => {
		const org = await account("commerce");
		await usage(org, "emailsSent", 10_900, CLOSED);

		const bill = await billAccountUsage({ organizationId: org, now: NOW });

		expect(bill.chargedCents).toBe(0);
	});
});
