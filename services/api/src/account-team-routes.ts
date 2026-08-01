import {
	canGrantCapabilities,
	resolveCapabilities,
} from "@quickengine/auth/rbac";
import { syncSeats } from "@quickengine/billing";
import {
	acceptOrganizationInvitation,
	createOrganizationInvitation,
	listOrganizationInvitations,
	loadOrgRoleCapabilities,
	removeOrganizationMember,
	revokeOrganizationInvitation,
} from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeAccount, authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * Team membership — invitations and removal.
 *
 * Previously Next server actions, so **inviting a teammate was impossible through
 * the API**. Account-level, therefore session-authorised: an API key belongs to a
 * single workspace and must never be able to add people to the organization.
 */

export const inviteMemberSchema = z.object({
	email: z.string().trim().email(),
	/** Any role the organization has defined, not just the built-in three. */
	role: z.string().trim().min(1).max(50),
	expiresInDays: z.number().int().min(1).max(30).optional(),
});

export function registerAccountTeamRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const manage = authorizeAccount(options.platform, {
		capability: "members.manage",
	});

	app.get("/v1/account/invitations", manage, async (c) => {
		const { organizationId } = c.get("account");
		return respond(c, {
			items: await listOrganizationInvitations(organizationId),
		});
	});

	/**
	 * Invite someone.
	 *
	 * **The inviter cannot hand out more than they hold.** Without this check an
	 * administrator could invite someone as `owner`, accept from a second account
	 * and take over billing — the same escalation custom roles are guarded against
	 * when a role is created, applied here at the point the role is handed out.
	 */
	app.post("/v1/account/invitations", manage, async (c) => {
		const input = inviteMemberSchema.parse(await c.req.json());
		const { organizationId, userId, capabilities } = c.get("account");

		const granted = resolveCapabilities(
			input.role,
			await loadOrgRoleCapabilities(organizationId),
		);
		if (granted.length === 0) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				`"${input.role}" is not a role in this organization.`,
				400,
			);
		}
		if (!canGrantCapabilities(capabilities, granted)) {
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"You cannot invite someone to a role with more permissions than your own.",
				403,
			);
		}

		const invitation = await createOrganizationInvitation({
			organizationId,
			email: input.email,
			role: input.role,
			invitedByUserId: userId,
			expiresInDays: input.expiresInDays,
		});
		// The token is returned once, to be emailed. It is stored hashed, so it can
		// never be read back out afterwards.
		return respond(c, invitation, 201);
	});

	/**
	 * Accept an invitation.
	 *
	 * 🔴 **Deliberately NOT behind `members.manage`.** The invitee has no role in
	 * the organization yet — that is the entire point — so requiring a permission
	 * they cannot possibly hold would make every invitation impossible to accept.
	 * **The token is the authorization**, and it is single-use, expiring, and
	 * compared as a hash.
	 */
	app.post(
		"/v1/account/invitations/:token/accept",
		authorizeSession(options.platform),
		async (c) => {
			const { userId } = c.get("account");
			try {
				const accepted = await acceptOrganizationInvitation(
					c.req.param("token"),
					userId,
				);
				// The organization just grew. On a per-seat plan this is also what
				// Stripe bills, so the count has to move before the next request is
				// measured against it.
				await syncSeats(accepted.organizationId);
				return respond(c, accepted);
			} catch (error) {
				const reason = error instanceof Error ? error.message : "";
				// One message for every failure mode. Distinguishing "expired" from
				// "already used" from "never existed" lets someone probe for valid
				// tokens.
				if (
					reason.includes("INVITATION") ||
					reason.includes("EXPIRED") ||
					reason.includes("NOT_FOUND")
				) {
					return respondError(
						c,
						"NOT_FOUND",
						"That invitation is no longer valid.",
						404,
					);
				}
				throw error;
			}
		},
	);

	app.delete("/v1/account/invitations/:id", manage, async (c) => {
		const { organizationId } = c.get("account");
		const revoked = await revokeOrganizationInvitation(
			organizationId,
			c.req.param("id"),
		);
		if (!revoked) {
			return respondError(c, "NOT_FOUND", "Invitation not found.", 404);
		}
		return respond(c, { revoked: true });
	});

	/**
	 * Remove a member.
	 *
	 * The data layer refuses to remove the organization owner. An organization with
	 * no owner has nobody who can manage billing or promote a replacement, and
	 * there is no way back from it.
	 */
	app.delete("/v1/account/members/:userId", manage, async (c) => {
		const { organizationId } = c.get("account");
		const removed = await removeOrganizationMember(
			organizationId,
			c.req.param("userId"),
		);
		if (!removed) {
			return respondError(
				c,
				"CONFLICT",
				"That member cannot be removed. The organization owner must be replaced first.",
				409,
			);
		}
		// Shrinking matters as much as growing: without this the organization keeps
		// paying for a seat nobody occupies.
		await syncSeats(organizationId);
		return respond(c, { removed: true });
	});
}
