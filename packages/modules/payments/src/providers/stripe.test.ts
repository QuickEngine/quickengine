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
	constructEvent: vi.fn(),
}));

vi.mock("stripe", () => ({
	default: class {
		accounts = {
			create: mocks.create,
			retrieve: mocks.retrieve,
			update: mocks.update,
		};
		accountLinks = { create: mocks.linkCreate };
		webhooks = { constructEvent: mocks.constructEvent };
	},
}));

vi.mock("@quickengine/env/server", () => ({
	serverEnv: {
		STRIPE_CONNECT_TEST_SECRET_KEY: "sk_test_not_a_real_key",
		STRIPE_CONNECT_LIVE_SECRET_KEY: "sk_live_not_a_real_key",
		STRIPE_CONNECT_TEST_WEBHOOK_SECRET: "whsec_not_a_real_secret",
		STRIPE_CONNECT_LIVE_WEBHOOK_SECRET: "whsec_not_a_real_secret",
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
				capabilities: {
					card_payments: { requested: true },
					transfers: { requested: true },
				},
			}),
		);
	});

	/**
	 * 🔴 STANDARD, and it is a liability decision rather than a preference.
	 *
	 * With Standard the merchant holds their own Stripe account and their own
	 * disputes. With Express the PLATFORM carries the losses — Stripe refuses to
	 * create one until the platform accepts "you'll be liable for seller losses"
	 * and agrees to reserves being held against our balance.
	 *
	 * Absorbing a merchant's chargebacks is paying for a business outcome they
	 * earned, which hard rule 7 exists to prevent, and QuickEngine takes no cut
	 * of a sale to fund it. Asserted here because a one-word change back would
	 * be invisible in review and would quietly move that liability onto us.
	 */
	it("creates a Standard account, so the merchant carries their own losses", async () => {
		mocks.create.mockResolvedValue({ id: "acct_new" });

		await onboard();

		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({ type: "standard" }),
		);
		expect(mocks.create).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "express" }),
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

/**
 * 🔴 These use the event shapes Stripe actually sends, copied from a real
 * sandbox delivery, because the previous refund test faked one.
 *
 * It built a `charge.refunded` event by spreading a `payment_intent.succeeded`
 * event, so the object kept a `pi_` id and the test passed against a handler
 * that could never fire in production. A real refund event carries a CHARGE,
 * whose `id` is a `ch_...` matching no payment row, and settlement dropped it
 * at "event carries no payment id" before any handler saw it.
 */
describe("Stripe webhook payment identity", () => {
	const request = {
		headers: { "stripe-signature": "t=1,v1=x" },
		rawBody: "{}",
	};

	it("reads the intent from a payment_intent event", async () => {
		mocks.constructEvent.mockReturnValue({
			id: "evt_pi",
			type: "payment_intent.succeeded",
			account: "acct_1",
			data: { object: { object: "payment_intent", id: "pi_123" } },
		});

		expect(
			await stripePaymentProvider.verifyWebhook(request, "test"),
		).toMatchObject({ externalPaymentId: "pi_123" });
	});

	it("reads the intent from a charge event rather than the charge id", async () => {
		mocks.constructEvent.mockReturnValue({
			id: "evt_3U3Pei8NQtUJM22L0eMj8BAJ",
			type: "charge.refunded",
			account: "acct_1U3K278NQtUJM22L",
			data: {
				object: {
					object: "charge",
					id: "ch_3U3Pei8NQtUJM22L05AzoFXT",
					payment_intent: "pi_3U3Pei8NQtUJM22L0smaFcPw",
					amount_refunded: 3600,
					refunded: true,
				},
			},
		});

		expect(
			await stripePaymentProvider.verifyWebhook(request, "test"),
		).toMatchObject({
			type: "charge.refunded",
			// The INTENT, never `ch_...`, because that is what a payment row stores.
			externalPaymentId: "pi_3U3Pei8NQtUJM22L0smaFcPw",
		});
	});

	it("claims no payment id from an event that is about something else", async () => {
		mocks.constructEvent.mockReturnValue({
			id: "evt_payout",
			type: "payout.paid",
			account: "acct_1",
			data: { object: { object: "payout", id: "po_123" } },
		});

		expect(
			await stripePaymentProvider.verifyWebhook(request, "test"),
		).toMatchObject({ externalPaymentId: null });
	});
});
