import { getSession } from "@quickengine/auth/server";
import { createCheckoutSession } from "@quickengine/billing";
import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";

const getAppUrl = () =>
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ??
	process.env.NEXT_PUBLIC_APP_URL ??
	"http://localhost:3000";

export async function POST(request: Request): Promise<Response> {
	const session = await getSession(request.headers);
	if (!session) {
		return Response.json({ error: "Unauthenticated." }, { status: 401 });
	}

	const { planId, cycle } = (await request.json().catch(() => ({}))) as {
		planId?: QuickEnginePlanId;
		cycle?: QuickEngineBillingCycle;
	};
	if (!planId) {
		return Response.json({ error: "planId is required." }, { status: 400 });
	}

	const appUrl = getAppUrl();
	try {
		const checkout = await createCheckoutSession({
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			planId,
			cycle: cycle ?? "monthly",
			successUrl: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
			cancelUrl: `${appUrl}/checkout/cancel`,
		});

		if (!checkout.url) {
			return Response.json(
				{ error: "Stripe did not return a checkout URL." },
				{ status: 502 },
			);
		}
		return Response.json({ url: checkout.url });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Checkout failed." },
			{ status: 500 },
		);
	}
}
