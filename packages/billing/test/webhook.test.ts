import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { getStripe } from "../src/stripe";
import { constructStripeEvent, handleStripeEvent } from "../src/webhook";
import { fakeSubscription, getSubRow, insertOrg } from "./helpers";

const event = (type: string, object: unknown): Stripe.Event =>
	({ type, data: { object } }) as unknown as Stripe.Event;

const ORG1 = "00000000-0000-4000-8000-0000000ccd01";
const ORG2 = "00000000-0000-4000-8000-0000000ccd02";
const ORG3 = "00000000-0000-4000-8000-0000000ccd03";
const ORG4 = "00000000-0000-4000-8000-0000000ccd04";
const ORG5 = "00000000-0000-4000-8000-0000000ccd05";

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
		await insertOrg(ORG1);

		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({
					organizationId: ORG1,
					customer: "cus_1",
					priceId: "price_test_grow_monthly",
					status: "active",
				}),
			),
		);

		const row = await getSubRow(ORG1);
		expect(row?.plan_id).toBe("grow");
		expect(row?.status).toBe("active");
		expect(row?.stripe_subscription_id).toBe("sub_test_123");
		expect(row?.billing_cycle).toBe("monthly");
	});

	/**
	 * 🔴 A subscription stopped being one line the day storage packs were added
	 * to it, and Stripe promises nothing about the order of `items.data`. Reading
	 * position zero would eventually find the add-on, fail to map it to a plan,
	 * and fall back to "free" — silently downgrading a paying customer from a
	 * routine webhook, with no failed payment to explain it.
	 *
	 * The add-on is deliberately FIRST here, which is the order that broke it.
	 */
	it("finds the plan when an add-on item comes first", async () => {
		await insertOrg(ORG5);
		const sub = fakeSubscription({
			organizationId: ORG5,
			customer: "cus_5",
			priceId: "price_test_grow_monthly",
			status: "active",
		});
		const planItem = sub.items.data[0];
		sub.items.data = [
			{
				...planItem,
				id: "si_storage",
				quantity: 2,
				price: {
					...planItem.price,
					id: "price_test_storage_100",
				},
			} as (typeof sub.items.data)[number],
			planItem,
		];

		await handleStripeEvent(event("customer.subscription.updated", sub));

		const row = await getSubRow(ORG5);
		expect(row?.plan_id).toBe("grow");
		// The add-on is reconciled from the same event, so the allowance follows
		// whatever the customer is actually paying for.
		expect(row?.storage_pack_id).toBe("small");
		expect(row?.storage_pack_quantity).toBe(2);
	});

	it("downgrades to free + canceled when the subscription is deleted", async () => {
		await insertOrg(ORG2);
		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({ organizationId: ORG2, customer: "cus_2" }),
			),
		);

		await handleStripeEvent(
			event(
				"customer.subscription.deleted",
				fakeSubscription({ organizationId: ORG2, customer: "cus_2" }),
			),
		);

		const row = await getSubRow(ORG2);
		expect(row?.status).toBe("canceled");
		expect(row?.plan_id).toBe("free");
	});

	it("marks the account past_due on a failed invoice payment", async () => {
		await insertOrg(ORG3);
		await handleStripeEvent(
			event(
				"customer.subscription.created",
				fakeSubscription({ organizationId: ORG3, customer: "cus_3" }),
			),
		);

		await handleStripeEvent(
			event("invoice.payment_failed", { customer: "cus_3" }),
		);

		const row = await getSubRow(ORG3);
		expect(row?.status).toBe("past_due");
	});

	it("is idempotent — redelivering the same event converges", async () => {
		await insertOrg(ORG4);
		const sub = fakeSubscription({ organizationId: ORG4, customer: "cus_4" });

		await handleStripeEvent(event("customer.subscription.updated", sub));
		await handleStripeEvent(event("customer.subscription.updated", sub));

		const rows = await (
			await import("@quickengine/db/testing")
		).testDbClient()`SELECT count(*)::int AS n FROM quickengine_subscriptions WHERE organization_id = ${ORG4}`;
		expect(rows[0].n).toBe(1);
	});
});
