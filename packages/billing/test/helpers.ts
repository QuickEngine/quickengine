import { testDbClient } from "@quickengine/db/testing";
import type Stripe from "stripe";

/** Insert a user row (users.id is text). */
export const insertUser = async (id: string, email: string): Promise<void> => {
	await testDbClient()`
		INSERT INTO quickengine_users (id, name, email, email_verified)
		VALUES (${id}, 'Test User', ${email}, true)
	`;
};

/**
 * Insert an organization (with an owner user) so subscription FKs resolve. Billing is
 * org-scoped, so tests anchor subscriptions to an org. `orgId` must be a valid UUID.
 */
export const insertOrg = async (
	orgId: string,
	ownerId = `${orgId}-owner`,
): Promise<void> => {
	await insertUser(ownerId, `${ownerId}@example.com`);
	await testDbClient()`
		INSERT INTO quickengine_organizations (id, name, slug, is_personal, owner_id)
		VALUES (${orgId}, 'Test Org', ${orgId}, false, ${ownerId})
	`;
};

/** Read an organization's subscription row (snake_case columns) or undefined. */
export const getSubRow = async (
	organizationId: string,
): Promise<Record<string, unknown> | undefined> => {
	const rows = await testDbClient()`
		SELECT * FROM quickengine_subscriptions
		WHERE organization_id = ${organizationId} LIMIT 1
	`;
	return rows[0];
};

/** Build a minimal Stripe.Subscription with only the fields our code reads. */
export const fakeSubscription = (overrides: {
	organizationId?: string;
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
		metadata: overrides.organizationId
			? { organizationId: overrides.organizationId }
			: {},
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
