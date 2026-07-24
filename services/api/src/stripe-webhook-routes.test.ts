import { beforeEach, describe, expect, it, vi } from "vitest";

const constructStripeEvent = vi.fn();
const handleStripeEvent = vi.fn();

vi.mock("@quickengine/billing", () => ({
	constructStripeEvent: (...args: unknown[]) => constructStripeEvent(...args),
	handleStripeEvent: (...args: unknown[]) => handleStripeEvent(...args),
}));

const { createApp } = await import("./app");
const { noopLogger } = await import("./logger");
const { registerStripeWebhookRoutes } = await import("./stripe-webhook-routes");
type ApiConfig = import("./config").ApiConfig;

const config: ApiConfig = {
	baseUrl: "https://api.quickengine.xyz",
	bodyLimitBytes: 64 * 1024,
	corsOrigins: new Set(["https://dash.quickengine.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 500,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

const app = createApp(config, {
	registerRoutes(instance) {
		registerStripeWebhookRoutes(instance, { logger: noopLogger });
	},
});

const post = (body: string, headers: Record<string, string> = {}) =>
	app.request("/webhooks/stripe", {
		method: "POST",
		body,
		headers: { "Content-Type": "application/json", ...headers },
	});

beforeEach(() => {
	constructStripeEvent.mockReset();
	handleStripeEvent.mockReset();
});

describe("Stripe webhook route", () => {
	it("rejects a request with no signature header without calling Stripe", async () => {
		const response = await post('{"id":"evt_1"}');

		expect(response.status).toBe(400);
		expect(constructStripeEvent).not.toHaveBeenCalled();
		expect(handleStripeEvent).not.toHaveBeenCalled();
	});

	it("rejects an invalid signature with 400 so Stripe stops retrying", async () => {
		constructStripeEvent.mockImplementation(() => {
			throw new Error("No signatures found matching the expected signature");
		});

		const response = await post('{"id":"evt_1"}', {
			"stripe-signature": "t=1,v1=deadbeef",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid Stripe signature.",
		});
		expect(handleStripeEvent).not.toHaveBeenCalled();
	});

	it("reports a missing webhook secret as 500 so the event is retried, not dropped", async () => {
		constructStripeEvent.mockImplementation(() => {
			throw new Error("STRIPE_WEBHOOK_SECRET is not set");
		});

		const response = await post('{"id":"evt_1"}', {
			"stripe-signature": "t=1,v1=deadbeef",
		});

		expect(response.status).toBe(500);
		expect(handleStripeEvent).not.toHaveBeenCalled();
	});

	it("verifies the byte-exact raw body, not a reserialized copy", async () => {
		// Key insight this guards: the body-limit middleware drains and replays the request
		// stream. Signature verification hashes the exact bytes Stripe sent, so any
		// reserialization (key reordering, whitespace loss, unicode escaping) breaks it.
		const payload =
			'{"id":"evt_1",  "type":"invoice.paid","note":"café — ünïcode","nested":{"b":2,"a":1}}';
		constructStripeEvent.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
		handleStripeEvent.mockResolvedValue(undefined);

		const response = await post(payload, { "stripe-signature": "t=1,v1=abc" });

		expect(response.status).toBe(200);
		expect(constructStripeEvent).toHaveBeenCalledWith(payload, "t=1,v1=abc");
	});

	it("acknowledges a verified event and applies it exactly once", async () => {
		const event = { id: "evt_2", type: "customer.subscription.updated" };
		constructStripeEvent.mockReturnValue(event);
		handleStripeEvent.mockResolvedValue(undefined);

		const response = await post('{"id":"evt_2"}', {
			"stripe-signature": "t=1,v1=abc",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(handleStripeEvent).toHaveBeenCalledExactlyOnceWith(event);
	});

	it("returns 500 when the handler fails so Stripe redelivers", async () => {
		constructStripeEvent.mockReturnValue({ id: "evt_3", type: "invoice.paid" });
		handleStripeEvent.mockRejectedValue(new Error("database unavailable"));

		const response = await post('{"id":"evt_3"}', {
			"stripe-signature": "t=1,v1=abc",
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Webhook handler failed." });
	});

	it("passes CSRF protection: Stripe posts cross-origin with no cookie", async () => {
		constructStripeEvent.mockReturnValue({ id: "evt_4", type: "invoice.paid" });
		handleStripeEvent.mockResolvedValue(undefined);

		const response = await post('{"id":"evt_4"}', {
			"stripe-signature": "t=1,v1=abc",
			Origin: "https://stripe.com",
		});

		expect(response.status).toBe(200);
	});
});
