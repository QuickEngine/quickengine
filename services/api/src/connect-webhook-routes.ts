import { completeReferralsForOrder } from "@quickengine/mod-orders";
import {
	applyCheckoutSettlement,
	decryptProviderCredentials,
	getPaymentAccount,
	getPaymentProvider,
	type PaymentProvider,
} from "@quickengine/mod-payments";
import type { Context, Hono } from "hono";
import { settlePaidCheckout } from "./checkout-settlement";
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
	/**
	 * The credentials and stored identity for a business's own provider app.
	 *
	 * Returns undefined for Stripe and for any workspace that has not connected
	 * this way — the caller then falls back to platform verification, which is
	 * exactly right for Connect.
	 */
	async function readPaymentAccountCredentials(
		workspaceId: string,
		provider: string,
	) {
		if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return undefined;
		try {
			const account = await getPaymentAccount(workspaceId, provider);
			if (!account?.credentials || !account.externalAccountId) return undefined;
			return {
				externalAccountId: account.externalAccountId,
				credentials: decryptProviderCredentials(account.credentials),
			};
		} catch {
			// An undecryptable row must not crash the endpoint. Verification then
			// fails on its own and the request is refused, which is the safe answer.
			return undefined;
		}
	}

	/** Apply a VERIFIED event, and say so loudly when it could not be applied. */
	async function settle(
		c: Context<PlatformEnv>,
		event: Awaited<ReturnType<PaymentProvider["verifyWebhook"]>> & object,
		providerId: "stripe" | "paypal",
		environment: "test" | "live",
	) {
		try {
			const outcome = await applyCheckoutSettlement(
				event,
				event.externalAccountId,
				providerId,
				environment,
				settlePaidCheckout,
			);
			if (outcome.applied) {
				options.logger.info("connect.webhook.order_placed", {
					orderId: outcome.orderId,
					eventType: event.type,
					requestId: c.get("requestId"),
				});
				// 🔴 A referral pays out only once the order is actually PAID.
				// Crediting the referrer at checkout would turn an abandoned payment
				// into free money, which is how referral programmes get farmed.
				try {
					await completeReferralsForOrder({
						workspaceId: outcome.workspaceId,
						orderId: outcome.orderId,
					});
				} catch (error) {
					// The order is paid either way. Refusing the webhook would make the
					// provider retry a settlement that already succeeded.
					options.logger.error("connect.webhook.referral_settle_failed", {
						error,
						orderId: outcome.orderId,
						requestId: c.get("requestId"),
					});
				}
			} else if (!outcome.expected) {
				// 🔴 A settlement event we could NOT apply. The provider believes money
				// moved; QuickDash has no record of it. Answering 200 is still correct —
				// a retry would never succeed — but staying silent is how the Stripe
				// refund defect survived three PRs.
				options.logger.error("connect.webhook.settlement_dropped", {
					reason: outcome.reason,
					eventType: event.type,
					provider: providerId,
					environment,
					externalPaymentId: event.externalPaymentId,
					externalAccountId: event.externalAccountId,
					requestId: c.get("requestId"),
				});
			}
			// 200 either way. "Not ours to act on" is a successful outcome, and a
			// non-2xx would have the provider redeliver it indefinitely.
			return c.json({ received: true });
		} catch (error) {
			options.logger.error("connect.webhook.handler_failed", {
				error,
				eventType: event.type,
				requestId: c.get("requestId"),
			});
			return c.json({ error: "Webhook handler failed." }, 500);
		}
	}

	/**
	 * Per-business endpoints, for providers connected with their own app.
	 *
	 * 🔴 The workspace is in the PATH, and that is load-bearing. PayPal verifies a
	 * signature against the webhook id of the app that sent it, and each business
	 * has its own — so we must know WHICH business before we can verify anything.
	 * Taking that from the payload would mean trusting an unverified body to say
	 * who it is, which is the same as not verifying at all.
	 *
	 * Knowing the workspace grants nothing on its own: an unsigned request still
	 * fails verification and is refused. The path only selects which key to check
	 * against.
	 */
	app.post(
		"/webhooks/:providerId/connect/:environment/:workspaceId",
		async (c) => {
			const providerId = c.req.param("providerId");
			const environment = c.req.param("environment");
			if (
				(providerId !== "stripe" && providerId !== "paypal") ||
				(environment !== "test" && environment !== "live")
			) {
				return c.json({ error: "Unknown webhook endpoint." }, 404);
			}
			const payload = await c.req.text();
			const headers = Object.fromEntries(c.req.raw.headers.entries());

			const account = await readPaymentAccountCredentials(
				c.req.param("workspaceId"),
				providerId,
			);
			const event = await getPaymentProvider(providerId).verifyWebhook(
				{ rawBody: payload, headers },
				environment,
				account?.credentials,
			);
			if (!event) {
				options.logger.warn("connect.webhook.signature_rejected", {
					requestId: c.get("requestId"),
				});
				return c.json({ error: "Invalid signature." }, 400);
			}

			// 🔴 Identity comes from the row we resolved, NOT from the payload. The
			// event names a PayPal merchant id, which is not what we stored for a
			// business connected by its own app — trusting the payload here would
			// send every settlement to "unknown connected account" and drop it.
			const externalAccountId =
				account?.externalAccountId ?? event.externalAccountId;

			return settle(
				c,
				{ ...event, externalAccountId },
				providerId,
				environment,
			);
		},
	);

	for (const providerId of ["stripe", "paypal"] as const) {
		for (const environment of ["test", "live"] as const) {
			app.post(`/webhooks/${providerId}/connect/${environment}`, async (c) => {
				// ⚠️ RAW text. Signature verification hashes the exact bytes that were
				// sent — parsing and re-serialising produces a different string and a
				// signature that can never match.
				const payload = await c.req.text();

				const headers = Object.fromEntries(c.req.raw.headers.entries());
				const event = await getPaymentProvider(providerId).verifyWebhook(
					{ rawBody: payload, headers },
					environment,
				);
				if (!event) {
					// Never say why. A caller who cannot sign should not learn whether the
					// secret is missing, the timestamp stale, or the digest wrong.
					options.logger.warn("connect.webhook.signature_rejected", {
						requestId: c.get("requestId"),
					});
					return c.json({ error: "Invalid signature." }, 400);
				}

				return settle(c, event, providerId, environment);
			});
		}
	}
}
