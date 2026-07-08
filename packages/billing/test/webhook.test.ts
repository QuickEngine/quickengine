import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { getStripe } from "../src/stripe";
import { constructStripeEvent, handleStripeEvent } from "../src/webhook";
import { fakeSubscription, getSubRow, insertUser } from "./helpers";

const event = (type: string, object: unknown): Stripe.Event =>
	({ type, data: { object } }) as unknown as Stripe.Event;

describe("webhook signature verification", () => {
	it("rejects a tampered/invalid signature", () => {
		expect(() =>
			constructStripeEvent('{"hello":"world"}', "t=1,v1=deadbeef"),
		).toThrow();
	});

	it("accepts a correctly signed payload", () => {
		const payload = JSON.stringify({ id: "evt_1", type: "ping" });
		const header = getStripe().webhooks.generateTestHeaderString({
			payload,
			secret: process.env.STRIPE_WEBHOOK_SECRET as string,
		});
		const parsed = constructStripeEvent(payload, header);
		expect(parsed.id).toBe("evt_1");
	});
});

describe("webhook → subscription sync (money path)", () => {
	it("records a new subscription with the mapped plan + status", async () => {
		await insertUser("user_1", "one@example.com");

		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({
					userId: "user_1",
					customer: "cus_1",
					priceId: "price_test_pro_monthly",
					status: "active",
				}),
			),
		);

		const row = await getSubRow("user_1");
		expect(row?.plan_id).toBe("pro");
		expect(row?.status).toBe("active");
		expect(row?.stripe_subscription_id).toBe("sub_test_123");
		expect(row?.billing_cycle).toBe("monthly");
	});

	it("downgrades to free + canceled when the subscription is deleted", async () => {
		await insertUser("user_2", "two@example.com");
		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({ userId: "user_2", customer: "cus_2" }),
			),
		);

		await handleStripeEvent(
			event(
				"customer.subscription.deleted",
				fakeSubscription({ userId: "user_2", customer: "cus_2" }),
			),
		);

		const row = await getSubRow("user_2");
		expect(row?.status).toBe("canceled");
		expect(row?.plan_id).toBe("free");
	});

	it("marks the account past_due on a failed invoice payment", async () => {
		await insertUser("user_3", "three@example.com");
		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({ userId: "user_3", customer: "cus_3" }),
			),
		);

		await handleStripeEvent(
			event("invoice.payment_failed", { customer: "cus_3" }),
		);

		const row = await getSubRow("user_3");
		expect(row?.status).toBe("past_due");
	});

	it("is idempotent — redelivering the same event converges", async () => {
		await insertUser("user_4", "four@example.com");
		const sub = fakeSubscription({ userId: "user_4", customer: "cus_4" });

		await handleStripeEvent(event("customer.subscription.updated", sub));
		await handleStripeEvent(event("customer.subscription.updated", sub));

		const rows = await (
			await import("@quickengine/db/testing")
		).testDbClient()`SELECT count(*)::int AS n FROM quickengine_subscriptions WHERE user_id = 'user_4'`;
		expect(rows[0].n).toBe(1);
	});
});
