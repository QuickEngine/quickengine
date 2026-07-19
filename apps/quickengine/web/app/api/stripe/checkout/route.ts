import { can } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import { createCheckoutSession } from "@quickengine/billing";
import { listOrganizationMembers, resolveOrgRole } from "@quickengine/db";
import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";

const getAppUrl = () =>
	process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL ?? "http://localhost:3000";

// Start Stripe Checkout for an ORGANIZATION. The caller (the account app's upgrade UI) passes
// the organization to bill; the plan and seats bill to that org, not the user. The signed-in
// user must hold `billing.manage` on the org, and seats = the org's current member count.
export async function POST(request: Request): Promise<Response> {
	const session = await getSession(request.headers);
	if (!session) {
		return Response.json({ error: "Unauthenticated." }, { status: 401 });
	}

	const { organizationId, planId, cycle } = (await request
		.json()
		.catch(() => ({}))) as {
		organizationId?: string;
		planId?: QuickEnginePlanId;
		cycle?: QuickEngineBillingCycle;
	};
	if (!organizationId || !planId) {
		return Response.json(
			{ error: "organizationId and planId are required." },
			{ status: 400 },
		);
	}

	// Only someone who can manage the org's billing may start checkout for it.
	const role = await resolveOrgRole(session.user.id, organizationId);
	if (!role || !can(role, "billing.manage")) {
		return Response.json({ error: "Forbidden." }, { status: 403 });
	}

	const members = await listOrganizationMembers(organizationId);
	const appUrl = getAppUrl();
	try {
		const checkout = await createCheckoutSession({
			organizationId,
			billingEmail: session.user.email,
			billingName: session.user.name,
			planId,
			cycle: cycle ?? "monthly",
			seats: members.length,
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
