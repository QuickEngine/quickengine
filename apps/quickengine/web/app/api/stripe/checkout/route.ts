const stripeCheckoutUrl = "https://api.stripe.com/v1/checkout/sessions";
const stripeVersion = "2026-02-25.preview";

const getAppUrl = () =>
	process.env.NEXT_PUBLIC_APP_URL ??
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ??
	"http://localhost:3000";

export async function POST(): Promise<Response> {
	const secretKey = process.env.STRIPE_SECRET_KEY;
	const priceId = process.env.STRIPE_QUICKENGINE_SUITE_MONTHLY_PRICE_ID;

	if (!secretKey || !priceId) {
		return Response.json(
			{
				error:
					"Stripe checkout is not configured. Set STRIPE_SECRET_KEY and STRIPE_QUICKENGINE_SUITE_MONTHLY_PRICE_ID.",
			},
			{ status: 500 },
		);
	}

	const appUrl = getAppUrl();
	const body = new URLSearchParams({
		mode: "subscription",
		"line_items[0][price]": priceId,
		"line_items[0][quantity]": "1",
		"managed_payments[enabled]": "true",
		allow_promotion_codes: "true",
		billing_address_collection: "auto",
		success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${appUrl}/checkout/cancel`,
	});

	const response = await fetch(stripeCheckoutUrl, {
		method: "POST",
		headers: {
			authorization: `Bearer ${secretKey}`,
			"content-type": "application/x-www-form-urlencoded",
			"stripe-version": stripeVersion,
		},
		body,
	});

	const session: unknown = await response.json();

	if (!response.ok) {
		return Response.json(
			{
				error: "Stripe failed to create a checkout session.",
				details: session,
			},
			{ status: response.status },
		);
	}

	if (
		typeof session !== "object" ||
		session === null ||
		!("url" in session) ||
		typeof session.url !== "string"
	) {
		return Response.json(
			{ error: "Stripe did not return a checkout URL." },
			{ status: 502 },
		);
	}

	return Response.redirect(session.url, 303);
}
