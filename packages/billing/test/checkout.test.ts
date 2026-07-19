import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Stripe client so checkout tests never touch the network.
const customersCreate = vi.fn(async () => ({ id: "cus_mock" }));
// retrieve resolves for known customers and throws for a "stale" one, so we can
// exercise the self-heal path when a stored customer no longer exists at Stripe.
const customersRetrieve = vi.fn(async (id: string) => {
	if (id === "cus_stale") throw new Error("No such customer: 'cus_stale'");
	return { id, deleted: false };
});
const sessionsCreate = vi.fn(async () => ({
	id: "cs_mock",
	url: "https://checkout.stripe.test/cs_mock",
}));

vi.mock("../src/stripe", () => ({
	getStripe: () => ({
		customers: { create: customersCreate, retrieve: customersRetrieve },
		checkout: { sessions: { create: sessionsCreate } },
	}),
	isStripeConfigured: () => true,
}));

import { testDbClient } from "@quickengine/db/testing";
import { createCheckoutSession } from "../src/checkout";
import { findOrCreateStripeCustomer } from "../src/subscriptions";
import { getSubRow, insertOrg } from "./helpers";

const ORG1 = "00000000-0000-4000-8000-0000000cc001";
const ORG2 = "00000000-0000-4000-8000-0000000cc002";
const ORG3 = "00000000-0000-4000-8000-0000000cc003";
const ORG4 = "00000000-0000-4000-8000-0000000cc004";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createCheckoutSession", () => {
	it("creates a session and persists the Stripe customer", async () => {
		await insertOrg(ORG1);

		const result = await createCheckoutSession({
			organizationId: ORG1,
			billingEmail: "co1@example.com",
			billingName: "Co One",
			planId: "pro",
			cycle: "monthly",
			seats: 3,
			successUrl: "http://localhost:3000/checkout/success",
			cancelUrl: "http://localhost:3000/checkout/cancel",
		});

		expect(result.url).toContain("checkout.stripe.test");
		expect(sessionsCreate).toHaveBeenCalledOnce();

		const row = await getSubRow(ORG1);
		expect(row?.stripe_customer_id).toBe("cus_mock");
	});

	it("throws when the plan has no configured price", async () => {
		await insertOrg(ORG2);

		await expect(
			createCheckoutSession({
				organizationId: ORG2,
				billingEmail: "co2@example.com",
				planId: "growth", // no STRIPE_PRICE_GROWTH_* set
				cycle: "monthly",
				successUrl: "http://s",
				cancelUrl: "http://c",
			}),
		).rejects.toThrow(/no stripe price/i);

		// Bailed before creating a customer.
		expect(customersCreate).not.toHaveBeenCalled();
	});
});

describe("findOrCreateStripeCustomer", () => {
	it("creates the customer once and reuses it", async () => {
		await insertOrg(ORG3);

		const first = await findOrCreateStripeCustomer({
			organizationId: ORG3,
			email: "co3@example.com",
		});
		const second = await findOrCreateStripeCustomer({
			organizationId: ORG3,
			email: "co3@example.com",
		});

		expect(first).toBe("cus_mock");
		expect(second).toBe("cus_mock");
		expect(customersCreate).toHaveBeenCalledTimes(1);
	});

	it("self-heals when the stored customer no longer exists at Stripe", async () => {
		await insertOrg(ORG4);
		// Anchor a stale customer (e.g. left over from a different account/env).
		await testDbClient()`
			INSERT INTO quickengine_subscriptions (organization_id, stripe_customer_id, plan_id, status)
			VALUES (${ORG4}, 'cus_stale', 'free', 'active')
		`;

		const result = await findOrCreateStripeCustomer({
			organizationId: ORG4,
			email: "co4@example.com",
		});

		// Recreated rather than returning the dead ID.
		expect(result).toBe("cus_mock");
		expect(customersCreate).toHaveBeenCalledTimes(1);
		const row = await getSubRow(ORG4);
		expect(row?.stripe_customer_id).toBe("cus_mock");
	});
});
