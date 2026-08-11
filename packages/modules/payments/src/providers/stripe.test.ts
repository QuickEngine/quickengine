import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Stripe adapter had no tests until 2026-08-11, when the first real
 * Caffeinate purchase failed with "you cannot create a charge on a connected
 * account without the card_payments capability enabled".
 *
 * Two defects, one root cause, both covered here: onboarding never REQUESTED
 * the capability, and readiness never CHECKED it — so QuickDash showed a green
 * connected account to an operator who could not take a single payment.
 */

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	retrieve: vi.fn(),
	update: vi.fn(),
	linkCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
	default: class {
		accounts = {
			create: mocks.create,
			retrieve: mocks.retrieve,
			update: mocks.update,
		};
		accountLinks = { create: mocks.linkCreate };
	},
}));

vi.mock("@quickengine/env/server", () => ({
	serverEnv: {
		STRIPE_CONNECT_TEST_SECRET_KEY: "sk_test_not_a_real_key",
		STRIPE_CONNECT_LIVE_SECRET_KEY: "sk_live_not_a_real_key",
	},
}));

const { stripePaymentProvider } = await import("./stripe");

const onboard = () =>
	stripePaymentProvider.startOnboarding({
		environment: "test",
		email: "merchant@example.com",
		country: "CA",
		returnUrl: "https://quickdash.example/return",
		refreshUrl: "https://quickdash.example/refresh",
	});

beforeEach(() => {
	mocks.create.mockReset();
	mocks.retrieve.mockReset();
	mocks.update.mockReset();
	mocks.linkCreate.mockReset();
	mocks.linkCreate.mockResolvedValue({ url: "https://connect.stripe.test/x" });
});

describe("Stripe connected accounts", () => {
	it("requests card_payments so the account can actually be charged", async () => {
		mocks.create.mockResolvedValue({ id: "acct_new" });

		await onboard();

		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "express",
				capabilities: {
					card_payments: { requested: true },
					transfers: { requested: true },
				},
			}),
		);
	});

	/**
	 * Resuming must REPAIR, not just re-read. An account created before
	 * capabilities were requested is permanently unchargeable, so reading it
	 * back would strand that merchant behind a "connected" badge with no route
	 * out of the state through the product.
	 */
	it("re-requests capabilities when resuming, so a stuck account can recover", async () => {
		mocks.update.mockResolvedValue({ id: "acct_pending" });

		const result = await stripePaymentProvider.startOnboarding({
			environment: "test",
			existingAccountId: "acct_pending",
			returnUrl: "https://quickdash.example/return",
			refreshUrl: "https://quickdash.example/refresh",
		});

		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.update).toHaveBeenCalledWith("acct_pending", {
			capabilities: {
				card_payments: { requested: true },
				transfers: { requested: true },
			},
		});
		expect(result.account.externalAccountId).toBe("acct_pending");
	});

	/**
	 * 🔴 The regression itself. Stripe reports `charges_enabled: true` on an
	 * Express account whose `card_payments` has not been granted, and then
	 * rejects every PaymentIntent against it. Trusting that flag told the
	 * operator they were open for business while checkout was dead.
	 */
	it("is not chargeable while card_payments is inactive, whatever charges_enabled says", async () => {
		mocks.retrieve.mockResolvedValue({
			id: "acct_half_ready",
			charges_enabled: true,
			payouts_enabled: false,
			capabilities: { card_payments: "inactive", transfers: "active" },
		});

		const account = await stripePaymentProvider.getAccount(
			"acct_half_ready",
			"test",
		);

		expect(account.chargesEnabled).toBe(false);
	});

	it("is not chargeable when Stripe reports no capabilities at all", async () => {
		mocks.retrieve.mockResolvedValue({
			id: "acct_bare",
			charges_enabled: true,
		});

		expect(
			(await stripePaymentProvider.getAccount("acct_bare", "test"))
				.chargesEnabled,
		).toBe(false);
	});

	it("is chargeable only once both the flag and the capability agree", async () => {
		mocks.retrieve.mockResolvedValue({
			id: "acct_ready",
			charges_enabled: true,
			payouts_enabled: true,
			capabilities: { card_payments: "active", transfers: "active" },
		});

		const account = await stripePaymentProvider.getAccount(
			"acct_ready",
			"test",
		);

		expect(account).toMatchObject({
			externalAccountId: "acct_ready",
			chargesEnabled: true,
			payoutsEnabled: true,
		});
	});
});
