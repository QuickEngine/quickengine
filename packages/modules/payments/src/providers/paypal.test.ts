import { describe, expect, it } from "vitest";
import { getPaymentProvider, isChargeableProvider } from "./index";
import { parsePayPalWebhookEvent } from "./paypal";

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
});
