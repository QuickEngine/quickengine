import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

/**
 * Resend delivery webhooks.
 *
 * Moved here from the marketing app during the Vite migration: that app is now a
 * static SPA with no server runtime, and a signed webhook needs somewhere real to
 * land. The API is where every other provider webhook already lives.
 *
 * **Signed over `<webhook-id>.<timestamp>.<raw body>`**, Standard Webhooks style.
 * The comparison is constant-time and the timestamp is bounded, so a captured
 * request cannot be replayed later.
 */

const TOLERANCE_SECONDS = 300;

/** Resend sends `v1,<sig>` and may send several space-separated candidates. */
const signatureParts = (header: string) =>
	header
		.split(" ")
		.flatMap((part) => part.split(","))
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && part !== "v1");

const secretBytes = (secret: string) =>
	secret.startsWith("whsec_")
		? Buffer.from(secret.replace("whsec_", ""), "base64")
		: Buffer.from(secret, "utf8");

const verify = ({
	payload,
	signature,
	secret,
	timestamp,
	webhookId,
}: {
	payload: string;
	signature: string;
	secret: string;
	timestamp: string;
	webhookId: string;
}) => {
	const seconds = Number(timestamp);
	// A signature with no time bound is replayable forever.
	if (
		!Number.isFinite(seconds) ||
		Math.abs(Date.now() / 1000 - seconds) > TOLERANCE_SECONDS
	) {
		return false;
	}

	const expected = Buffer.from(
		createHmac("sha256", secretBytes(secret))
			.update(`${webhookId}.${timestamp}.${payload}`)
			.digest("base64"),
	);

	return signatureParts(signature).some((candidate) => {
		const received = Buffer.from(candidate);
		// Length must match before timingSafeEqual, which throws on a mismatch.
		return (
			received.length === expected.length && timingSafeEqual(received, expected)
		);
	});
};

export function registerResendWebhookRoutes(
	app: Hono<PlatformEnv>,
	options: { logger: ApiLogger },
) {
	app.post("/webhooks/resend", async (c) => {
		const secret = process.env.RESEND_WEBHOOK_SECRET;
		const webhookId = c.req.header("webhook-id");
		const timestamp = c.req.header("webhook-timestamp");
		const signature = c.req.header("webhook-signature");
		// Raw text, never re-serialized JSON: the signature covers exact bytes.
		const payload = await c.req.text();

		if (!secret) {
			// Our misconfiguration, not a bad caller. 500 so Resend retries once the
			// secret exists rather than dropping the event permanently.
			return c.json({ error: "Resend webhook is not configured." }, 500);
		}
		if (!webhookId || !timestamp || !signature) {
			return c.json({ error: "Missing Resend signature headers." }, 400);
		}
		if (!verify({ payload, signature, secret, timestamp, webhookId })) {
			// Never say why: a caller who cannot sign should not learn what failed.
			options.logger.warn("resend.webhook.signature_rejected", {
				requestId: c.get("requestId"),
			});
			return c.json({ error: "Invalid Resend webhook signature." }, 400);
		}

		const event = JSON.parse(payload) as {
			type?: string;
			created_at?: string;
			data?: { email_id?: string };
		};
		options.logger.info("resend.webhook.received", {
			type: event.type,
			emailId: event.data?.email_id,
			requestId: c.get("requestId"),
		});

		return c.json({ received: true });
	});
}
