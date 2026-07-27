import {
	countUnreadNotifications,
	getInvitationByToken,
	listNotifications,
	listOrganizationMembers,
	listWorkspacesForOrganization,
} from "@quickengine/db";
import type { Hono } from "hono";
import { authorizeAccount, authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * Reads for the account console.
 *
 * The mutations landed first, but the pages also read — and under Next they read
 * by querying the database inside server components. A static SPA cannot, so
 * every one of those queries needs an endpoint. Building only the writes would
 * have left the UI unable to render.
 */
export function registerAccountReadRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const view = authorizeAccount(options.platform, {
		capability: "workspace.view",
	});
	const session = authorizeSession(options.platform);

	app.get("/v1/account/workspaces", view, async (c) =>
		respond(c, {
			items: await listWorkspacesForOrganization(
				c.get("account").organizationId,
			),
		}),
	);

	app.get("/v1/account/members", view, async (c) =>
		respond(c, {
			items: await listOrganizationMembers(c.get("account").organizationId),
		}),
	);

	app.get("/v1/account/notifications", session, async (c) => {
		const { userId } = c.get("account");
		const [items, unread] = await Promise.all([
			listNotifications(userId),
			countUnreadNotifications(userId),
		]);
		return respond(c, { items, unread });
	});

	/**
	 * Look up an invitation before accepting it, so the join page can show who
	 * invited you and to what.
	 *
	 * Only a session is required — the invitee is not a member yet. The token is
	 * the authorization, and an invalid one is indistinguishable from an expired
	 * or already-used one so nobody can probe for valid tokens.
	 */
	app.get("/v1/account/invitations/:token", session, async (c) => {
		const invitation = await getInvitationByToken(c.req.param("token"));
		if (!invitation) {
			return respondError(
				c,
				"NOT_FOUND",
				"That invitation is no longer valid.",
				404,
			);
		}
		return respond(c, invitation);
	});
}
