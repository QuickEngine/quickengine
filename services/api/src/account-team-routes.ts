import {
	canGrantCapabilities,
	isBuiltInRole,
	resolveCapabilities,
	WORKSPACE_CAPABILITIES,
} from "@quickengine/auth/rbac";
import { admitSeat, syncSeats } from "@quickengine/billing";
import {
	acceptOrganizationInvitation,
	countMembersWithRole,
	createOrganizationInvitation,
	createOrgRole,
	db,
	deleteOrgRole,
	eq,
	getInvitationByToken,
	listOrganizationInvitations,
	listOrgRoles,
	loadOrgRoleCapabilities,
	quickengineOrganizations,
	quickengineUsers,
	recordControlPlaneAudit,
	removeOrganizationMember,
	revokeOrganizationInvitation,
	updateOrganizationMemberRole,
	updateOrgRole,
} from "@quickengine/db";
import { serverEnv } from "@quickengine/env/server";
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

export const changeMemberRoleSchema = z.object({
	role: z.string().trim().min(1).max(50),
});

const capability = z.enum(
	WORKSPACE_CAPABILITIES as unknown as [string, ...string[]],
);

export const accountRoleSchema = z.object({
	name: z.string().trim().min(1).max(50),
	description: z.string().trim().max(500).nullable().optional(),
	capabilities: z.array(capability).max(WORKSPACE_CAPABILITIES.length),
});

export const accountRolePatchSchema = accountRoleSchema.partial();

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

		// Checked here as well as on accept. The accept path is the one that
		// protects the limit; this one exists so nobody emails an invitation that
		// is guaranteed to bounce, and so the person who can fix it — the admin
		// sending it — is the one who sees why.
		const seat = await admitSeat(organizationId);
		if (!seat.allowed) {
			return respondError(
				c,
				"USAGE_LIMIT_EXCEEDED",
				`Your plan includes ${seat.limit} seat${seat.limit === 1 ? "" : "s"} and all of them are taken. Upgrade your plan or remove a member to invite someone else.`,
				402,
			);
		}

		const [organization] = await db
			.select({ name: quickengineOrganizations.name })
			.from(quickengineOrganizations)
			.where(eq(quickengineOrganizations.id, organizationId))
			.limit(1);
		const [inviter] = await db
			.select({ name: quickengineUsers.name })
			.from(quickengineUsers)
			.where(eq(quickengineUsers.id, userId))
			.limit(1);
		const organizationName = organization?.name ?? null;
		const inviterName = inviter?.name ?? null;

		const invitation = await createOrganizationInvitation({
			organizationId,
			email: input.email,
			role: input.role,
			invitedByUserId: userId,
			expiresInDays: input.expiresInDays,
		});
		await recordControlPlaneAudit({
			organizationId,
			actorId: userId,
			actorType: "user",
			action: "invitation.created",
			resourceType: "invitation",
			resourceId: invitation.id,
			requestId: c.get("requestId"),
			// The ROLE, never the email — that is a person's contact detail, and a
			// security log is not the place to accumulate them.
			metadata: { role: input.role },
		});
		// 🔴 Send it. The token exists exactly once, here — it is stored hashed, so
		// this email is the only copy that will ever exist. Until 2026-08-15 this
		// route created the row, returned the token "to be emailed", and nobody
		// emailed it: every invitation ever sent was invisible to the person it was
		// for.
		//
		// ⚠️ Imported lazily, never at module scope. A top-level mail SDK import
		// lands in the module graph of route registration and of the OpenAPI
		// route-table test, which is exactly how CI timed out three times in one
		// day. Nothing about DEFINING this route needs a mail client.
		const inviteUrl = new URL(
			`/join/${invitation.token}`,
			serverEnv.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ??
				"https://account.quickdash.xyz",
		).toString();
		let emailed = false;
		let emailFailure: string | null = null;
		try {
			const { getEmailProvider } = await import("@quickengine/email");
			const { organizationInviteEmail } = await import(
				"@quickengine/email/templates"
			);
			const rendered = organizationInviteEmail({
				brand: {
					name: "QuickEngine",
					supportEmail:
						serverEnv.EMAIL_FROM?.match(/<(.+)>/)?.[1] ??
						"support@quickdash.xyz",
				},
				organizationName: organizationName ?? "your organization",
				invitedByName: inviterName,
				role: input.role,
				url: inviteUrl,
				expiresInDays: input.expiresInDays ?? 7,
			});
			await getEmailProvider().send({
				to: input.email,
				subject: rendered.subject,
				html: rendered.html,
				text: rendered.text,
			});
			emailed = true;
		} catch (error) {
			// 🔴 The invitation EXISTS whether or not the mail provider answered.
			// Failing the request here would leave a valid pending invitation behind
			// a 500 and invite the operator to create a second one. The row and its
			// link are returned regardless, so the link can be copied by hand.
			// 🔴 Returned to the caller, not only logged. Most routes are registered
			// without a logger, so the previous version dropped the reason entirely:
			// mail silently failed and the operator was told the invitation was
			// sent. The provider's own message is the useful part — "you can only
			// send to your own address until a domain is verified" is actionable,
			// "email failed" is not.
			emailFailure =
				error instanceof Error
					? error.message
					: "The mail provider refused it.";
			options.platform.logger?.error?.("invitation.email_failed", {
				invitationId: invitation.id,
				// Never the address or the token: one is a person's contact detail,
				// the other is a credential.
				reason: error instanceof Error ? error.name : "unknown",
			});
		}

		// The token is returned once, to be emailed. It is stored hashed, so it can
		// never be read back out afterwards.
		return respond(
			c,
			{ ...invitation, url: inviteUrl, emailed, emailFailure },
			201,
		);
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
				// 🔴 The authoritative seat gate. The one on invitation creation is a
				// courtesy — an invitation issued while there was room can still arrive
				// after the last seat is taken, and only this check sees the state that
				// actually matters.
				//
				// Peeked before redeeming rather than rolled back after, because
				// accepting writes the membership and marks the invitation used in one
				// transaction; undoing that is strictly worse than not doing it.
				const pending = await getInvitationByToken(c.req.param("token"));
				if (pending) {
					const seat = await admitSeat(pending.organizationId);
					if (!seat.allowed) {
						return respondError(
							c,
							"USAGE_LIMIT_EXCEEDED",
							"This organization has used every seat on its plan. Ask an administrator to upgrade or free a seat, then open this invitation again.",
							402,
						);
					}
				}

				const accepted = await acceptOrganizationInvitation(
					c.req.param("token"),
					userId,
				);
				// The organization just grew. On a per-seat plan this is also what
				// Stripe bills, so the count has to move before the next request is
				// measured against it.
				await syncSeats(accepted.organizationId);
				await recordControlPlaneAudit({
					organizationId: accepted.organizationId,
					actorId: userId,
					actorType: "user",
					action: "member.joined",
					resourceType: "member",
					resourceId: userId,
					requestId: c.get("requestId"),
					metadata: { role: accepted.role },
				});
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
	/**
	 * Change a member's role.
	 *
	 * 🔑 The same two guards as inviting, because it is the same decision made
	 * later: the role has to exist in this organization, and **nobody may grant
	 * more than they themselves hold**. Without the second one an administrator
	 * could promote a second account of their own to owner and take over billing —
	 * the exact escalation the invitation path already refuses.
	 *
	 * The owner's own role is refused by the data layer. Transferring ownership is
	 * a deliberate separate act, not an edit to a dropdown.
	 */
	app.patch("/v1/account/members/:userId", manage, async (c) => {
		const input = changeMemberRoleSchema.parse(await c.req.json());
		const { organizationId, userId: actorId, capabilities } = c.get("account");
		const target = c.req.param("userId");

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
				"You cannot give someone a role with more permissions than your own.",
				403,
			);
		}

		const changed = await updateOrganizationMemberRole(
			organizationId,
			target,
			input.role,
		);
		if (!changed) {
			return respondError(
				c,
				"CONFLICT",
				"That member's role cannot be changed. The organization owner must be transferred first.",
				409,
			);
		}

		// 🔴 Who can do what, changed by whom. A capability grant with no evidence
		// behind it is the audit gap that member removal was fixed for.
		await recordControlPlaneAudit({
			organizationId,
			actorId,
			actorType: "user",
			action: "member.role_changed",
			resourceType: "member",
			resourceId: target,
			requestId: c.get("requestId"),
			metadata: { role: input.role },
		});
		return respond(c, { userId: target, role: input.role });
	});

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
		// 🔴 The one that mattered most. A member could be granted billing.manage
		// and later removed with no evidence anyone did it.
		await recordControlPlaneAudit({
			organizationId,
			actorId: c.get("account").userId,
			actorType: "user",
			action: "member.removed",
			resourceType: "member",
			resourceId: c.req.param("userId"),
			requestId: c.get("requestId"),
		});
		return respond(c, { removed: true });
	});

	/**
	 * Custom roles, from the control plane.
	 *
	 * 🔑 The same organization roles `/v1/roles` manages — the difference is the
	 * credential. That path proves access with a workspace, which an Account
	 * session does not have and should not need: roles are an organization-level
	 * concern and Account is where an organization is administered.
	 *
	 * The three invariants are the ones that path documents, enforced identically
	 * because they are properties of the data, not of the route:
	 *
	 * 1. **Nobody grants a capability they do not hold** — otherwise an admin mints
	 *    a role carrying `billing.manage`, assigns it to themselves, and escalates.
	 * 2. **Built-ins cannot be redefined.** `owner`, `admin` and `member` live in
	 *    code; a custom role taking one of those names would shadow it.
	 * 3. **A role somebody still holds cannot be deleted** — they would resolve to
	 *    no capabilities and lose access with nothing explaining why.
	 */
	app.get("/v1/account/roles", manage, async (c) => {
		const { organizationId } = c.get("account");
		return respond(c, { items: await listOrgRoles(organizationId) });
	});

	app.get("/v1/account/capabilities", manage, async (c) =>
		respond(c, { items: WORKSPACE_CAPABILITIES }),
	);

	app.post("/v1/account/roles", manage, async (c) => {
		const input = accountRoleSchema.parse(await c.req.json());
		const { organizationId, userId, capabilities } = c.get("account");

		if (isBuiltInRole(input.name.toLowerCase())) {
			return respondError(
				c,
				"CONFLICT",
				`"${input.name}" is a built-in role and cannot be redefined.`,
				409,
			);
		}
		if (!canGrantCapabilities(capabilities, input.capabilities)) {
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"You cannot grant a permission you do not hold yourself.",
				403,
			);
		}

		try {
			const role = await createOrgRole({ organizationId, ...input });
			await recordControlPlaneAudit({
				organizationId,
				actorId: userId,
				actorType: "user",
				action: "role.created",
				resourceType: "role",
				resourceId: role.id,
				requestId: c.get("requestId"),
				// The capability COUNT, not the list: a name and a number describe what
				// happened without copying a permission set into a log.
				metadata: { name: role.name, capabilities: input.capabilities.length },
			});
			return respond(c, role, 201);
		} catch {
			// The unique index is case-insensitive, so a duplicate can only surface
			// here — and saying so plainly beats leaking a database error.
			return respondError(
				c,
				"CONFLICT",
				"A role with that name already exists.",
				409,
			);
		}
	});

	app.patch("/v1/account/roles/:id", manage, async (c) => {
		const input = accountRolePatchSchema.parse(await c.req.json());
		const { organizationId, userId, capabilities } = c.get("account");

		if (input.name && isBuiltInRole(input.name.toLowerCase())) {
			return respondError(
				c,
				"CONFLICT",
				`"${input.name}" is a built-in role and cannot be redefined.`,
				409,
			);
		}
		if (
			input.capabilities &&
			!canGrantCapabilities(capabilities, input.capabilities)
		) {
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"You cannot grant a permission you do not hold yourself.",
				403,
			);
		}

		const role = await updateOrgRole(organizationId, c.req.param("id"), input);
		if (!role) return respondError(c, "NOT_FOUND", "Role not found.", 404);
		await recordControlPlaneAudit({
			organizationId,
			actorId: userId,
			actorType: "user",
			action: "role.updated",
			resourceType: "role",
			resourceId: role.id,
			requestId: c.get("requestId"),
			// A rename rewrites every member's role string, so it silently reassigns
			// people. Worth recording as its own fact.
			metadata: {
				name: role.name,
				capabilities: input.capabilities?.length ?? -1,
			},
		});
		return respond(c, role);
	});

	app.delete("/v1/account/roles/:id", manage, async (c) => {
		const { organizationId, userId } = c.get("account");
		const existing = (await listOrgRoles(organizationId)).find(
			(role) => role.id === c.req.param("id"),
		);
		if (!existing) return respondError(c, "NOT_FOUND", "Role not found.", 404);

		const holders = await countMembersWithRole(organizationId, existing.name);
		if (holders > 0) {
			return respondError(
				c,
				"CONFLICT",
				`${holders} ${holders === 1 ? "person holds" : "people hold"} this role. Move them to another role first.`,
				409,
			);
		}

		await deleteOrgRole(organizationId, existing.id);
		await recordControlPlaneAudit({
			organizationId,
			actorId: userId,
			actorType: "user",
			action: "role.deleted",
			resourceType: "role",
			resourceId: existing.id,
			requestId: c.get("requestId"),
			metadata: { name: existing.name },
		});
		return respond(c, { deleted: true });
	});
}
