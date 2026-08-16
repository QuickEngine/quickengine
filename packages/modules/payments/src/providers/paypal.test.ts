import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PayPal is held to the SAME standard as Stripe, deliberately.
 *
 * Stripe got eight tests on 2026-08-11 after the first real Caffeinate purchase
 * failed on a capability nobody had requested or checked. PayPal had three, and
 * the businesses that will depend on it — Gemsutopia and Woolenlillies — are no
 * less real than the one that depends on Stripe. Every readiness and webhook
 * case Stripe covers is covered here.
 *
 * ⚠️ ONE case is deliberately absent: parsing a real `PAYMENT.CAPTURE.REFUNDED`
 * body. `TECH_DEBT.md` records that the Stripe refund defect passed a
 * hand-written test while remaining broken in production, because the fixture
 * was invented by copying a success event and changing its type. That test gets
 * written from a captured sandbox refund, and not before.
 */

const mocks = vi.hoisted(() => ({
	referral: vi.fn(),
	sellerByTracking: vi.fn(),
	sellerByMerchant: vi.fn(),
}));

vi.mock("./paypal-client", () => ({
	createPayPalSellerReferral: mocks.referral,
	getPayPalSellerByTrackingId: mocks.sellerByTracking,
	getPayPalSellerByMerchantId: mocks.sellerByMerchant,
	capturePayPalOrder: vi.fn(),
	createPayPalOrder: vi.fn(),
	getPayPalOrderCapture: vi.fn(),
	refundPayPalCapture: vi.fn(),
	verifyPayPalWebhook: vi.fn(),
}));

vi.mock("@quickengine/env/server", () => ({
	serverEnv: {
		PAYPAL_TEST_CLIENT_ID: "test-client-id",
		PAYPAL_TEST_CLIENT_SECRET: "test-client-secret",
		PAYPAL_TEST_PARTNER_MERCHANT_ID: "PARTNER123",
		PAYPAL_TEST_PARTNER_ATTRIBUTION_ID: "ATTRIBUTION123",
		PAYPAL_TEST_WEBHOOK_ID: "WH-ID",
	},
}));

const { parsePayPalWebhookEvent, paypalPaymentProvider } = await import(
	"./paypal"
);
const { getPaymentProvider, isChargeableProvider } = await import("./index");

beforeEach(() => {
	mocks.referral.mockReset();
	mocks.sellerByTracking.mockReset();
	mocks.sellerByMerchant.mockReset();
	mocks.referral.mockResolvedValue({
		actionUrl: "https://paypal.test/onboard",
	});
});

describe("PayPal provider adapter", () => {
	it("is selectable through the same registry as Stripe", () => {
		expect(getPaymentProvider("paypal").id).toBe("paypal");
		expect(isChargeableProvider("paypal")).toBe(true);
	});

	it("maps a completed capture into the canonical settlement event", () => {
		expect(
			parsePayPalWebhookEvent({
				id: "WH-EVENT",
				event_type: "PAYMENT.CAPTURE.COMPLETED",
				resource: {
					payee: { merchant_id: "SELLER123" },
					supplementary_data: { related_ids: { order_id: "ORDER123" } },
				},
			}),
		).toMatchObject({
			id: "WH-EVENT",
			type: "payment_intent.succeeded",
			externalPaymentId: "ORDER123",
			externalAccountId: "merchant:SELLER123",
		});
	});

	it("does not manufacture an authenticated event from malformed input", () => {
		expect(
			parsePayPalWebhookEvent({
				event_type: "PAYMENT.CAPTURE.COMPLETED",
			}),
		).toBeNull();
	});

	/**
	 * The PayPal half of Stripe's "claims no payment id from an event that is
	 * about something else". A payout or dispute event must not be mistaken for a
	 * payment, or settlement would look up a payment id that was never ours.
	 */
	it("claims no payment id from an event that is about something else", () => {
		expect(
			parsePayPalWebhookEvent({
				id: "WH-PAYOUT",
				event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
				resource: { batch_header: { payout_batch_id: "BATCH1" } },
			}),
		).toMatchObject({
			// Passed through untouched: an event we do not map is not a settlement
			// event, and `applyCheckoutSettlement` will ignore it by type.
			type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
			externalPaymentId: null,
			externalAccountId: null,
		});
	});

	/**
	 * ── Readiness ────────────────────────────────────────────────────────────
	 *
	 * 🔴 The Stripe defect was showing an operator a green connected account they
	 * could not take a single payment through. PayPal's equivalent of Stripe's
	 * `charges_enabled` + `card_payments` pair is `payments_receivable` +
	 * `primary_email_confirmed`, and BOTH must hold. These three tests are the
	 * direct counterparts of Stripe's three.
	 */
	it("is not chargeable while PayPal cannot receive payments", async () => {
		mocks.sellerByMerchant.mockResolvedValue({
			merchantId: "SELLER123",
			paymentsReceivable: false,
			primaryEmailConfirmed: true,
		});

		expect(
			await paypalPaymentProvider.getAccount("merchant:SELLER123", "test"),
		).toMatchObject({ chargesEnabled: false });
	});

	it("is not chargeable while the seller's email is unconfirmed", async () => {
		mocks.sellerByMerchant.mockResolvedValue({
			merchantId: "SELLER123",
			paymentsReceivable: true,
			primaryEmailConfirmed: false,
		});

		expect(
			await paypalPaymentProvider.getAccount("merchant:SELLER123", "test"),
		).toMatchObject({ chargesEnabled: false });
	});

	it("is chargeable only once both conditions agree", async () => {
		mocks.sellerByMerchant.mockResolvedValue({
			merchantId: "SELLER123",
			paymentsReceivable: true,
			primaryEmailConfirmed: true,
		});

		expect(
			await paypalPaymentProvider.getAccount("merchant:SELLER123", "test"),
		).toMatchObject({
			externalAccountId: "merchant:SELLER123",
			chargesEnabled: true,
			payoutsEnabled: true,
		});
	});

	/**
	 * An onboarding that was started but never finished resolves by tracking id,
	 * not merchant id — and must NOT report itself ready just because PayPal
	 * answered. Stripe's "a stuck account can recover" case.
	 */
	it("stays unready while onboarding has produced no merchant yet", async () => {
		mocks.sellerByTracking.mockResolvedValue({
			merchantId: null,
			paymentsReceivable: false,
			primaryEmailConfirmed: false,
		});

		expect(
			await paypalPaymentProvider.getAccount("tracking:abc-123", "test"),
		).toMatchObject({
			externalAccountId: "tracking:abc-123",
			chargesEnabled: false,
		});
	});

	it("promotes a finished onboarding from its tracking id to its merchant id", async () => {
		mocks.sellerByTracking.mockResolvedValue({
			merchantId: "SELLER123",
			paymentsReceivable: true,
			primaryEmailConfirmed: true,
		});

		expect(
			await paypalPaymentProvider.getAccount("tracking:abc-123", "test"),
		).toMatchObject({
			externalAccountId: "merchant:SELLER123",
			chargesEnabled: true,
		});
	});

	/**
	 * 🔴 Resuming onboarding must REUSE the tracking id. Minting a fresh one
	 * would strand the half-finished seller and create a second merchant record
	 * for one business — the duplicate-account failure the Stripe work fixed.
	 */
	it("resumes onboarding on the same tracking id instead of starting a second one", async () => {
		await paypalPaymentProvider.startOnboarding({
			environment: "test",
			email: "merchant@example.com",
			country: "CA",
			returnUrl: "https://quickdash.example/return",
			refreshUrl: "https://quickdash.example/refresh",
			existingAccountId: "tracking:keep-this-id",
		});

		expect(mocks.referral).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ trackingId: "keep-this-id" }),
		);
	});
});
