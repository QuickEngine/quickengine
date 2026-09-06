import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The founding-customer offer, and the rule that makes it safe.
 *
 * 🔴 The behaviour worth protecting is the REFUSAL. Quietly charging full price
 * to somebody who typed a discount code is the worst available outcome: they
 * believe they are paying one number, the card is charged another, and the first
 * they learn of it is the statement. So an unusable code fails the whole
 * subscription rather than being dropped.
 */
const promotionCodesList = vi.fn();
const subscriptionsCreate = vi.fn(async () => ({
	id: "sub_mock",
	latest_invoice: { confirmation_secret: { client_secret: "pi_secret" } },
}));

vi.mock("../src/stripe", () => ({
	getStripe: () => ({
		customers: {
			create: async () => ({ id: "cus_mock" }),
			retrieve: async (id: string) => ({ id, deleted: false }),
		},
		promotionCodes: { list: promotionCodesList },
		subscriptions: { create: subscriptionsCreate },
	}),
	isStripeConfigured: () => true,
}));

vi.mock("../src/subscriptions", () => ({
	findOrCreateStripeCustomer: async () => "cus_mock",
}));

vi.mock("../src/plans", async (original) => ({
	...(await original<Record<string, unknown>>()),
	getStripePriceId: () => "price_mock",
}));

const { createSubscriptionForPaymentElement } = await import("../src/checkout");

const start = (promotionCode?: string) =>
	createSubscriptionForPaymentElement({
		organizationId: "org_1",
		billingEmail: "founder@example.com",
		planId: "launch",
		cycle: "monthly",
		promotionCode,
	});

beforeEach(() => {
	promotionCodesList.mockReset();
	subscriptionsCreate.mockClear();
});

describe("a promotion code at checkout", () => {
	it("applies a valid code to the subscription", async () => {
		promotionCodesList.mockResolvedValue({ data: [{ id: "promo_founding" }] });

		await start("FOUNDING");

		expect(promotionCodesList).toHaveBeenCalledWith({
			code: "FOUNDING",
			// ⚠️ `active: true` is what stops an exhausted founding offer from
			// silently granting an eleventh person the price.
			active: true,
			limit: 1,
		});
		expect(subscriptionsCreate.mock.calls[0][0]).toMatchObject({
			discounts: [{ promotion_code: "promo_founding" }],
		});
	});

	it("refuses rather than quietly charging full price", async () => {
		promotionCodesList.mockResolvedValue({ data: [] });

		await expect(start("EXPIRED")).rejects.toThrow("PROMOTION_CODE_INVALID");
		// The subscription must not exist at all.
		expect(subscriptionsCreate).not.toHaveBeenCalled();
	});

	it("sends no discounts field when no code was given", async () => {
		await start();

		expect(promotionCodesList).not.toHaveBeenCalled();
		expect(subscriptionsCreate.mock.calls[0][0]).not.toHaveProperty(
			"discounts",
		);
	});

	it("ignores surrounding whitespace", async () => {
		promotionCodesList.mockResolvedValue({ data: [{ id: "promo_founding" }] });

		await start("  FOUNDING  ");

		expect(promotionCodesList).toHaveBeenCalledWith(
			expect.objectContaining({ code: "FOUNDING" }),
		);
	});
});
