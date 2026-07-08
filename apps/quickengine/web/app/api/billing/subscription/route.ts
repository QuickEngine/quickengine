import { getSession } from "@quickengine/auth/server";
import { getSubscriptionForUser } from "@quickengine/billing";

export async function GET(request: Request): Promise<Response> {
	const session = await getSession(request.headers);
	if (!session) {
		return Response.json({ signedIn: false, email: null, subscription: null });
	}
	const subscription = await getSubscriptionForUser(session.user.id);
	return Response.json({
		signedIn: true,
		email: session.user.email,
		subscription: subscription ?? null,
	});
}
