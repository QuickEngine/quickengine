import {
	applyCheckoutSettlement,
	getPaymentProvider,
} from "@quickengine/mod-payments";
import type { Hono } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Inbound webhooks for CONNECTED accounts — a merchant being paid.
 *
 * 🔴 Separate from `/webhooks/stripe`, which handles QuickEngine's own billing
 * (subscriptions, credit top-ups). Two different concerns, two different signing
 * secrets, and conflating them means a leak of one secret forges events for the
 * other.
 *
 * This is the route that turns a draft order into a placed one. Nothing else may
 * do it: the browser reporting success is a claim, a signed webhook is evidence.
 *
 * Status codes are load-bearing. Providers retry on 5xx and give up on 4xx:
 * · bad signature → 400, permanent, no retry
 * · event we do not act on → 200, so it stops being redelivered forever
 * · our handler broke → 500, please try again
 */
export function registerConnectWebhookRoutes(
	app: Hono<PlatformEnv>,
	options: { logger: ApiLogger },
) {
	app.post("/webhooks/stripe/connect", async (c) => {
		const signature = c.req.header("stripe-signature");
		if (!signature) {
			return c.json({ error: "Missing signature header." }, 400);
		}

		// ⚠️ RAW text. Signature verification hashes the exact bytes that were
		// sent — parsing and re-serialising produces a different string and a
		// signature that can never match.
		const payload = await c.req.text();

		const event = await getPaymentProvider("stripe").verifyWebhook(
			payload,
			signature,
		);
		if (!event) {
			// Never say why. A caller who cannot sign should not learn whether the
			// secret is missing, the timestamp stale, or the digest wrong.
			options.logger.warn("connect.webhook.signature_rejected", {
				requestId: c.get("requestId"),
			});
			return c.json({ error: "Invalid signature." }, 400);
		}

		// Which merchant this concerns. Connect events carry the account id at the
		// top level; the payload is the provider's own event shape.
		const account =
			(event.payload as { account?: string } | null)?.account ?? null;

		try {
			const outcome = await applyCheckoutSettlement(event, account);
			if (outcome.applied) {
				options.logger.info("connect.webhook.order_placed", {
					orderId: outcome.orderId,
					eventType: event.type,
					requestId: c.get("requestId"),
				});
			}
			// 200 either way. "Not ours to act on" is a successful outcome, and
			// answering non-2xx would have the provider redeliver it indefinitely.
			return c.json({ received: true });
		} catch (error) {
			options.logger.error("connect.webhook.handler_failed", {
				error,
				eventType: event.type,
				requestId: c.get("requestId"),
			});
			return c.json({ error: "Webhook handler failed." }, 500);
		}
	});
}
