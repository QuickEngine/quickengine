import { testDbClient } from "@quickengine/db/testing";
import type Stripe from "stripe";

/** Insert a user row so subscription FKs resolve. */
export const insertUser = async (id: string, email: string): Promise<void> => {
	await testDbClient()`
		INSERT INTO quickengine_users (id, name, email, email_verified)
		VALUES (${id}, 'Test User', ${email}, true)
	`;
};

/** Read the user's subscription row (snake_case columns) or undefined. */
export const getSubRow = async (
	userId: string,
): Promise<Record<string, unknown> | undefined> => {
	const rows = await testDbClient()`
		SELECT * FROM quickengine_subscriptions WHERE user_id = ${userId} LIMIT 1
	`;
	return rows[0];
};

/** Build a minimal Stripe.Subscription with only the fields our code reads. */
export const fakeSubscription = (overrides: {
	userId?: string;
	customer?: string;
	priceId?: string;
	status?: Stripe.Subscription.Status;
	interval?: "month" | "year";
	cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription => {
	return {
		id: "sub_test_123",
		customer: overrides.customer ?? "cus_test_123",
		status: overrides.status ?? "active",
		cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
		metadata: overrides.userId ? { userId: overrides.userId } : {},
		items: {
			data: [
				{
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
					price: {
						id: overrides.priceId ?? "price_test_pro_monthly",
						recurring: { interval: overrides.interval ?? "month" },
					},
				},
			],
		},
	} as unknown as Stripe.Subscription;
};
