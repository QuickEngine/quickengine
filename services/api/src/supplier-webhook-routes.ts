import {
	getSupplierAdapter,
	isAutomatedHandoff,
	recordSupplierShipment,
	resolveSupplierConnection,
} from "@quickengine/mod-inventory";
import type { Hono } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Inbound supplier events — a supplier telling us it shipped.
 *
 * ── Why the workspace AND supplier are in the PATH ───────────────────────────
 *
 * 🔴 Same load-bearing reason as the PayPal connect webhook: each connection has
 * its OWN signing secret, so we must know WHOSE secret to check before we can
 * verify anything. Taking that from the payload would mean trusting an
 * unverified body to say who it is, which is the same as not verifying at all.
 *
 * Shopify does send a shop domain header, but it is an unverified string. It is
 * used only AFTER a signature has proved authenticity, as a cross-check that a
 * correctly signed event arrived at the right endpoint.
 *
 * ── Status codes are load-bearing ────────────────────────────────────────────
 *
 * · Bad signature → **400**, with no reason. A caller who cannot sign must not
 *   learn whether the secret is missing, the body altered, or the digest wrong.
 * · A topic we do not act on → **200**. Providers disable endpoints that keep
 *   failing, and losing the topic we care about because we rejected the ones we
 *   do not is a slow, quiet outage.
 * · An event for an order we did not place → **200**. A supplier's store may
 *   carry orders QuickDash never raised; that is normal, not an error.
 * · Our own breakage → **500**, so it is retried.
 *
 * ⚠️ Deliberately outside the platform gate. Every other route requires a
 * workspace credential; this one is authenticated by the provider's signature
 * over the raw body, and a supplier has no session and no API key.
 */
export function registerSupplierWebhookRoutes(
	app: Hono<PlatformEnv>,
	options: { logger: ApiLogger },
) {
	const UUID =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	app.post(
		"/webhooks/supplier/:provider/:workspaceId/:supplierId",
		async (c) => {
			const provider = c.req.param("provider");
			const workspaceId = c.req.param("workspaceId");
			const supplierId = c.req.param("supplierId");

			// Shape-checked before any database work, so a scan cannot make us query.
			if (
				!isAutomatedHandoff(provider) ||
				!UUID.test(workspaceId) ||
				!UUID.test(supplierId)
			) {
				return c.json({ error: "Unknown webhook endpoint." }, 404);
			}

			// 🔴 RAW text. Signatures are computed over the exact bytes that were
			// sent, so parsing and re-serialising silently breaks verification.
			const rawBody = await c.req.text();
			const headers = Object.fromEntries(c.req.raw.headers.entries());

			const connection = await resolveSupplierConnection({
				workspaceId,
				supplierId,
				provider,
			});
			// Fails closed. No connection means no secret, which means nothing can
			// be verified — indistinguishable from a bad signature, and answered the
			// same way so neither reveals which it was.
			if (!connection) {
				options.logger.warn("supplier.webhook.signature_rejected", {
					requestId: c.get("requestId"),
				});
				return c.json({ error: "Invalid signature." }, 400);
			}

			const adapter = getSupplierAdapter(provider);
			const event = await adapter.verifyWebhook(
				{ rawBody, headers },
				connection,
			);
			if (!event) {
				options.logger.warn("supplier.webhook.signature_rejected", {
					requestId: c.get("requestId"),
				});
				return c.json({ error: "Invalid signature." }, 400);
			}

			/**
			 * ⚠️ Checked only AFTER verification. A correctly signed event arriving
			 * at the wrong workspace's endpoint is a real configuration mistake —
			 * two stores connected the wrong way round — and applying it would
			 * attach one business's tracking to another's order.
			 */
			const shopDomain = headers["x-shopify-shop-domain"];
			if (shopDomain && shopDomain !== connection.shopDomain) {
				options.logger.warn("supplier.webhook.account_mismatch", {
					requestId: c.get("requestId"),
					workspaceId,
				});
				return c.json({ error: "Invalid signature." }, 400);
			}

			const notice = adapter.toShipmentNotice(event);
			// A topic we do not act on. 200 so the endpoint stays healthy.
			if (!notice) return c.json({ received: true }, 200);

			const result = await recordSupplierShipment({
				workspaceId,
				supplierId,
				externalOrderId: notice.externalOrderId,
				carrier: notice.carrier,
				trackingNumber: notice.trackingNumber,
				trackingUrl: notice.trackingUrl,
			});

			if (!result.applied) {
				/**
				 * 🔴 Logged at ERROR, not swallowed. A supplier believes it shipped
				 * and QuickDash has no record of asking — staying silent is how the
				 * Stripe refund defect survived three PRs.
				 *
				 * `unknown` is a reference this workspace never issued; `not-sent` is
				 * one it issued but never dispatched. Both mean somebody is shipping
				 * coffee nobody asked them for. Only `already-shipped` stays quiet,
				 * because at-least-once delivery makes it the NORMAL case.
				 */
				if (result.reason !== "already-shipped") {
					options.logger.error("supplier.webhook.unmatched_shipment", {
						requestId: c.get("requestId"),
						workspaceId,
						supplierId,
						externalOrderId: notice.externalOrderId,
						reason: result.reason,
					});
				}
				return c.json({ received: true }, 200);
			}

			options.logger.info("supplier.webhook.shipment_recorded", {
				requestId: c.get("requestId"),
				purchaseOrderId: result.purchaseOrderId,
			});
			return c.json({ received: true }, 200);
		},
	);
}
