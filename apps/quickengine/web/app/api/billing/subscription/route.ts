import { getSession } from "@quickengine/auth/server";
import { getSubscriptionForOrg } from "@quickengine/billing";
import { resolveOrgRole } from "@quickengine/db";

// An organization's current subscription (billing is org-scoped). The caller passes the org
// via `?organizationId=`; the signed-in user must be a member of it.
export async function GET(request: Request): Promise<Response> {
	const session = await getSession(request.headers);
	if (!session) {
		return Response.json({ signedIn: false, email: null, subscription: null });
	}
	const organizationId = new URL(request.url).searchParams.get(
		"organizationId",
	);
	if (!organizationId) {
		return Response.json(
			{ error: "organizationId is required." },
			{ status: 400 },
		);
	}
	const role = await resolveOrgRole(session.user.id, organizationId);
	if (!role) {
		return Response.json({ error: "Forbidden." }, { status: 403 });
	}
	const subscription = await getSubscriptionForOrg(organizationId);
	return Response.json({
		signedIn: true,
		email: session.user.email,
		subscription: subscription ?? null,
	});
}
