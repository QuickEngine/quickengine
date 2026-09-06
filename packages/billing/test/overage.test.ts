import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Charging for usage past the allowance.
 *
 * 🔴 The assertion that matters most is idempotency. Overage is derived from a
 * running total, so the same block WILL be reported more than once — a retry, a
 * redelivered webhook, two requests crossing the line together. Billing the same
 * thousand requests twice is the kind of error that ends a customer
 * relationship rather than merely annoying somebody.
 */
const invoiceItemsCreate = vi.fn(async () => ({ id: "ii_mock" }));
const getSubscriptionForOrg = vi.fn();

vi.mock("../src/stripe", () => ({
	getStripe: () => ({ invoiceItems: { create: invoiceItemsCreate } }),
	isStripeConfigured: () => true,
}));
vi.mock("../src/subscriptions", () => ({
	getSubscriptionForOrg: (...args: unknown[]) => getSubscriptionForOrg(...args),
}));

const { billOverage } = await import("../src/overage");

const live = { stripeCustomerId: "cus_1", status: "active" };

beforeEach(() => {
	invoiceItemsCreate.mockClear();
	getSubscriptionForOrg.mockReset().mockResolvedValue(live);
});

describe("billing overage", () => {
	it("charges whole blocks only", async () => {
		// 25,000 over at 10,000 per block is two blocks, not two and a half.
		const result = await billOverage({
			organizationId: "org_1",
			meter: "apiRequests",
			unitsOverAllowance: 25_000,
		});

		expect(result).toEqual({ charged: true, blocks: 2, cents: 200 });
		expect(invoiceItemsCreate.mock.calls[0][0]).toMatchObject({
			customer: "cus_1",
			amount: 200,
			currency: "usd",
		});
	});

	it("charges nothing before the first block is complete", async () => {
		// One request past the allowance owes nothing. A one cent line item on an
		// invoice costs more in confusion than it earns.
		const result = await billOverage({
			organizationId: "org_1",
			meter: "apiRequests",
			unitsOverAllowance: 1,
		});

		expect(result.charged).toBe(false);
		expect(invoiceItemsCreate).not.toHaveBeenCalled();
	});

	it("keys on the block so a repeat cannot double charge", async () => {
		await billOverage({
			organizationId: "org_1",
			meter: "apiRequests",
			unitsOverAllowance: 30_000,
		});

		const options = invoiceItemsCreate.mock.calls[0][1] as {
			idempotencyKey: string;
		};
		expect(options.idempotencyKey).toContain("org_1");
		expect(options.idempotencyKey).toContain("apiRequests");
		// The block count is what makes a redelivery safe.
		expect(options.idempotencyKey).toMatch(/:3$/);
	});

	it("never charges a meter with no overage price", async () => {
		// Hard rule 7: a workspace is a business outcome, not infrastructure.
		const result = await billOverage({
			organizationId: "org_1",
			meter: "workspaces",
			unitsOverAllowance: 10,
		});

		expect(result.charged).toBe(false);
		expect(invoiceItemsCreate).not.toHaveBeenCalled();
	});

	it("does not add charges to a subscription that is not live", async () => {
		getSubscriptionForOrg.mockResolvedValue({ ...live, status: "canceled" });

		const result = await billOverage({
			organizationId: "org_1",
			meter: "apiRequests",
			unitsOverAllowance: 50_000,
		});

		expect(result.charged).toBe(false);
	});

	it("does nothing for an account with no subscription", async () => {
		getSubscriptionForOrg.mockResolvedValue(null);

		const result = await billOverage({
			organizationId: "org_free",
			meter: "apiRequests",
			unitsOverAllowance: 50_000,
		});

		// A free account is refused by the limit, never billed.
		expect(result.charged).toBe(false);
	});
});
