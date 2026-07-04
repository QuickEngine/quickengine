import { createHmac, timingSafeEqual } from "node:crypto";

const stripeSignatureToleranceSeconds = 300;

const parseStripeSignature = (signature: string) => {
	const parts = signature.split(",");
	const timestamp = parts
		.find((part) => part.startsWith("t="))
		?.replace("t=", "");
	const signatures = parts
		.filter((part) => part.startsWith("v1="))
		.map((part) => part.replace("v1=", ""));

	return { timestamp, signatures };
};

const verifyStripeSignature = ({
	payload,
	signature,
	secret,
}: {
	payload: string;
	signature: string;
	secret: string;
}) => {
	const { timestamp, signatures } = parseStripeSignature(signature);

	if (!timestamp || signatures.length === 0) {
		return false;
	}

	const timestampSeconds = Number(timestamp);

	if (
		!Number.isFinite(timestampSeconds) ||
		Math.abs(Date.now() / 1000 - timestampSeconds) >
			stripeSignatureToleranceSeconds
	) {
		return false;
	}

	const expectedSignature = createHmac("sha256", secret)
		.update(`${timestamp}.${payload}`)
		.digest("hex");
	const expectedBuffer = Buffer.from(expectedSignature, "hex");

	return signatures.some((receivedSignature) => {
		const receivedBuffer = Buffer.from(receivedSignature, "hex");

		return (
			receivedBuffer.length === expectedBuffer.length &&
			timingSafeEqual(receivedBuffer, expectedBuffer)
		);
	});
};

export async function POST(request: Request): Promise<Response> {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
	const signature = request.headers.get("stripe-signature");
	const payload = await request.text();

	if (!webhookSecret) {
		return Response.json(
			{ error: "Stripe webhook is not configured." },
			{ status: 500 },
		);
	}

	if (!signature) {
		return Response.json(
			{ error: "Missing Stripe signature header." },
			{ status: 400 },
		);
	}

	if (!verifyStripeSignature({ payload, signature, secret: webhookSecret })) {
		return Response.json(
			{ error: "Invalid Stripe signature." },
			{ status: 400 },
		);
	}

	const event = JSON.parse(payload) as {
		type?: string;
		data?: {
			object?: { id?: string; customer?: string; subscription?: string };
		};
	};

	if (event.type === "checkout.session.completed") {
		const session = event.data?.object;

		console.info("Stripe checkout completed", {
			sessionId: session?.id,
			customerId: session?.customer,
			subscriptionId: session?.subscription,
		});
	}

	return Response.json({ received: true });
}
