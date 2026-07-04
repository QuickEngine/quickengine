import { createHmac, timingSafeEqual } from "node:crypto";

const resendSignatureToleranceSeconds = 300;

type ResendWebhookEvent = {
	type?: string;
	created_at?: string;
	data?: {
		email_id?: string;
		from?: string;
		to?: string | string[];
		subject?: string;
	};
};

const getSignatureParts = (signatureHeader: string) =>
	signatureHeader
		.split(" ")
		.flatMap((part) => part.split(","))
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && part !== "v1");

const getWebhookSecret = (secret: string) => {
	if (!secret.startsWith("whsec_")) {
		return Buffer.from(secret, "utf8");
	}

	return Buffer.from(secret.replace("whsec_", ""), "base64");
};

const verifyResendSignature = ({
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
	const timestampSeconds = Number(timestamp);

	if (
		!Number.isFinite(timestampSeconds) ||
		Math.abs(Date.now() / 1000 - timestampSeconds) >
			resendSignatureToleranceSeconds
	) {
		return false;
	}

	const expectedSignature = createHmac("sha256", getWebhookSecret(secret))
		.update(`${webhookId}.${timestamp}.${payload}`)
		.digest("base64");
	const expectedBuffer = Buffer.from(expectedSignature);

	return getSignatureParts(signature).some((receivedSignature) => {
		const receivedBuffer = Buffer.from(receivedSignature);

		return (
			receivedBuffer.length === expectedBuffer.length &&
			timingSafeEqual(receivedBuffer, expectedBuffer)
		);
	});
};

export async function POST(request: Request): Promise<Response> {
	const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
	const webhookId = request.headers.get("webhook-id");
	const webhookTimestamp = request.headers.get("webhook-timestamp");
	const webhookSignature = request.headers.get("webhook-signature");
	const payload = await request.text();

	if (!webhookSecret) {
		return Response.json(
			{ error: "Resend webhook is not configured." },
			{ status: 500 },
		);
	}

	if (!webhookId || !webhookTimestamp || !webhookSignature) {
		return Response.json(
			{ error: "Missing Resend webhook signature headers." },
			{ status: 400 },
		);
	}

	if (
		!verifyResendSignature({
			payload,
			signature: webhookSignature,
			secret: webhookSecret,
			timestamp: webhookTimestamp,
			webhookId,
		})
	) {
		return Response.json(
			{ error: "Invalid Resend webhook signature." },
			{ status: 400 },
		);
	}

	const event = JSON.parse(payload) as ResendWebhookEvent;

	console.info("Resend webhook received", {
		type: event.type,
		emailId: event.data?.email_id,
		createdAt: event.created_at,
	});

	return Response.json({ received: true });
}
