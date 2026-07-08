import { constructStripeEvent, handleStripeEvent } from "@quickengine/billing";

export async function POST(request: Request): Promise<Response> {
	const signature = request.headers.get("stripe-signature");
	const payload = await request.text();

	if (!signature) {
		return Response.json(
			{ error: "Missing Stripe signature header." },
			{ status: 400 },
		);
	}

	// Type inferred from constructStripeEvent — no need to import the stripe SDK
	// into the web app just for a type annotation.
	let event: ReturnType<typeof constructStripeEvent>;
	try {
		event = constructStripeEvent(payload, signature);
	} catch {
		return Response.json(
			{ error: "Invalid Stripe signature." },
			{ status: 400 },
		);
	}

	try {
		await handleStripeEvent(event);
	} catch (error) {
		console.error("Stripe webhook handler failed", error);
		return Response.json({ error: "Webhook handler failed." }, { status: 500 });
	}

	return Response.json({ received: true });
}
