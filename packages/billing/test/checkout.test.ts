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
import { getSubRow, insertUser } from "./helpers";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createCheckoutSession", () => {
	it("creates a session and persists the Stripe customer", async () => {
		await insertUser("co_1", "co1@example.com");

		const result = await createCheckoutSession({
			user: { id: "co_1", email: "co1@example.com", name: "Co One" },
			planId: "pro",
			cycle: "monthly",
			successUrl: "http://localhost:3000/checkout/success",
			cancelUrl: "http://localhost:3000/checkout/cancel",
		});

		expect(result.url).toContain("checkout.stripe.test");
		expect(sessionsCreate).toHaveBeenCalledOnce();

		const row = await getSubRow("co_1");
		expect(row?.stripe_customer_id).toBe("cus_mock");
	});

	it("throws when the plan has no configured price", async () => {
		await insertUser("co_2", "co2@example.com");

		await expect(
			createCheckoutSession({
				user: { id: "co_2", email: "co2@example.com" },
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
		await insertUser("co_3", "co3@example.com");

		const first = await findOrCreateStripeCustomer({
			userId: "co_3",
			email: "co3@example.com",
		});
		const second = await findOrCreateStripeCustomer({
			userId: "co_3",
			email: "co3@example.com",
		});

		expect(first).toBe("cus_mock");
		expect(second).toBe("cus_mock");
		expect(customersCreate).toHaveBeenCalledTimes(1);
	});

	it("self-heals when the stored customer no longer exists at Stripe", async () => {
		await insertUser("co_4", "co4@example.com");
		// Anchor a stale customer (e.g. left over from a different account/env).
		await testDbClient()`
			INSERT INTO quickengine_subscriptions (user_id, stripe_customer_id, plan_id, status)
			VALUES ('co_4', 'cus_stale', 'free', 'active')
		`;

		const result = await findOrCreateStripeCustomer({
			userId: "co_4",
			email: "co4@example.com",
		});

		// Recreated rather than returning the dead ID.
		expect(result).toBe("cus_mock");
		expect(customersCreate).toHaveBeenCalledTimes(1);
		const row = await getSubRow("co_4");
		expect(row?.stripe_customer_id).toBe("cus_mock");
	});
});
