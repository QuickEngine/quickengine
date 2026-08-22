import {
	countUnreadNotifications,
	getInvitationByToken,
	listNotifications,
	listOrganizationMembers,
	listWorkspacesForOrganization,
	workspaceBelongsToOrganization,
	workspaceEnvironment,
} from "@quickengine/db";
import { getWorkspaceModules, listModules } from "@quickengine/module-registry";
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

	app.get("/v1/account/workspaces/:id/modules", view, async (c) => {
		const workspaceId = c.req.param("id");
		if (
			!(await workspaceBelongsToOrganization(
				workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const enabled = new Map(
			(await getWorkspaceModules(workspaceId)).map((module) => [
				module.id,
				module,
			]),
		);
		return respond(c, {
			items: listModules().map((module) => ({
				id: module.id,
				name: module.name,
				description: module.description,
				settings: enabled.get(module.id)?.settings ?? {},
				enabled: enabled.get(module.id)?.enabled ?? false,
			})),
		});
	});

	app.get("/v1/account/members", view, async (c) =>
		respond(c, {
			items: await listOrganizationMembers(c.get("account").organizationId),
		}),
	);

	/**
	 * The bell.
	 *
	 * 🔴 `?workspaceId=` narrows to that workspace's MODE, and it matters.
	 * Sandbox and live records live in the same tables, so without it a test
	 * order's "New order" is indistinguishable from a real customer paying —
	 * and acting on a test, or ignoring a real sale, are both failures.
	 *
	 * ⚠️ Account-level notifications — an invitation, a billing notice — carry no
	 * environment and appear in BOTH. They are not commerce and have no mode, and
	 * hiding them from a sandbox would lose the ones that matter most.
	 *
	 * Omitting the parameter returns everything, which is what the account app
	 * wants: it is not standing in a workspace.
	 */
	app.get("/v1/account/notifications", session, async (c) => {
		const { userId } = c.get("account");
		const workspaceId = c.req.query("workspaceId");
		const environment = workspaceId
			? await workspaceEnvironment(workspaceId)
			: undefined;
		const [items, unread] = await Promise.all([
			listNotifications(userId, { environment }),
			countUnreadNotifications(userId, { environment }),
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
