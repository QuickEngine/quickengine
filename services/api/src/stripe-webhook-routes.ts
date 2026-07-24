import { constructStripeEvent, handleStripeEvent } from "@quickengine/billing";
import type { Hono } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Stripe's inbound webhook. Deliberately outside `/v1` and outside the workspace/API-key gate:
 * Stripe authenticates with a payload signature, not a QuickEngine credential, and the event
 * is account-wide rather than workspace-scoped.
 *
 * Two properties this route must never lose:
 *  - **The raw body.** Signature verification hashes the exact bytes Stripe sent, so the payload
 *    is read as text and handed to Stripe unparsed. The body-limit middleware replays the
 *    original bytes into a fresh request, so reading here stays byte-exact.
 *  - **Honest status codes.** Stripe retries on 5xx and gives up on 4xx. An invalid signature is
 *    permanent (400, no retry); a handler failure is usually transient (500, please retry). The
 *    handlers are idempotent upserts keyed by customer or subscription, so redelivery converges.
 */
export function registerStripeWebhookRoutes(
	app: Hono<PlatformEnv>,
	options: { logger: ApiLogger },
) {
	app.post("/webhooks/stripe", async (c) => {
		const signature = c.req.header("stripe-signature");
		if (!signature) {
			return c.json({ error: "Missing Stripe signature header." }, 400);
		}

		const payload = await c.req.text();
		let event: ReturnType<typeof constructStripeEvent>;
		try {
			event = constructStripeEvent(payload, signature);
		} catch (error) {
			// Never echo the reason: a caller who can't sign shouldn't learn why it failed.
			options.logger.warn("stripe.webhook.signature_rejected", {
				requestId: c.get("requestId"),
			});
			if (error instanceof Error && /is not set/.test(error.message)) {
				// Misconfiguration on our side, not a bad caller. 500 so Stripe retries once
				// the secret is present instead of dropping the event permanently.
				return c.json({ error: "Webhook is not configured." }, 500);
			}
			return c.json({ error: "Invalid Stripe signature." }, 400);
		}

		try {
			await handleStripeEvent(event);
		} catch (error) {
			options.logger.error("stripe.webhook.handler_failed", {
				error,
				eventType: event.type,
				requestId: c.get("requestId"),
			});
			return c.json({ error: "Webhook handler failed." }, 500);
		}

		return c.json({ received: true });
	});
}
