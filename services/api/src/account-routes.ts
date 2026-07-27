import {
	issueApiKey,
	listApiKeys,
	revokeApiKey,
} from "@quickengine/auth/api-keys";
import {
	createSubscriptionForPaymentElement,
	getAccountPlanId,
	getSubscriptionForOrg,
	getUsage,
} from "@quickengine/billing";
import {
	createOrganization,
	deleteUserAccount,
	listOrganizationsForUser,
	markAllNotificationsRead,
	markNotificationRead,
	workspaceBelongsToOrganization,
} from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeAccount, authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * The rest of account management: organizations, API keys, billing,
 * notifications, and account deletion.
 *
 * All session-authorised. **An API key can never reach any of these** — a key
 * belongs to one workspace, so letting it mint further keys, change billing or
 * delete the account would turn one leaked credential into total control.
 */

export const createOrganizationSchema = z.object({
	name: z.string().trim().min(1).max(120),
});

export const createApiKeySchema = z.object({
	workspaceId: z.string().uuid(),
	name: z.string().trim().min(1).max(120),
	/** Matches `QuickEngineApiKeyType`. Publishable keys are safe in a browser. */
	type: z.enum(["publishable", "secret", "scoped"]),
	capabilities: z.array(z.string()).default([]),
	expiresAt: z.string().datetime().optional(),
});

export const startSubscriptionSchema = z.object({
	planId: z.string().trim().min(1),
	cycle: z.enum(["monthly", "annual"]),
	billingEmail: z.string().trim().email(),
	billingName: z.string().trim().optional(),
	seats: z.number().int().min(1).optional(),
});

export function registerAccountRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const session = authorizeSession(options.platform);
	const billing = authorizeAccount(options.platform, {
		capability: "billing.manage",
	});
	const keys = authorizeAccount(options.platform, {
		capability: "apikeys.manage",
	});

	// ---- Organizations ------------------------------------------------------

	app.get("/v1/account/organizations", session, async (c) =>
		respond(c, {
			items: await listOrganizationsForUser(c.get("account").userId),
		}),
	);

	/**
	 * Create an organization.
	 *
	 * Session-only: there is no organization to be a member of yet, so there is no
	 * membership to check.
	 */
	app.post("/v1/account/organizations", session, async (c) => {
		const input = createOrganizationSchema.parse(await c.req.json());
		const org = await createOrganization(input.name, c.get("account").userId);
		return respond(c, org, 201);
	});

	// ---- API keys -----------------------------------------------------------

	/**
	 * Issue an API key.
	 *
	 * 🔴 **The plaintext key is returned exactly once, here, and is never
	 * retrievable again** — only a hash and a short recognisable prefix are
	 * stored. A caller that loses it must issue a new one. This is deliberate: a
	 * key that can be read back out of the database is a key that leaks with the
	 * database.
	 */
	app.post("/v1/account/api-keys", keys, async (c) => {
		const input = createApiKeySchema.parse(await c.req.json());
		if (
			!(await workspaceBelongsToOrganization(
				input.workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const issued = await issueApiKey({
			workspaceId: input.workspaceId,
			createdByUserId: c.get("account").userId,
			name: input.name,
			type: input.type,
			capabilities: input.capabilities,
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
		});
		return respond(c, issued, 201);
	});

	app.delete("/v1/account/api-keys/:id", keys, async (c) => {
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"workspaceId is required.",
				400,
			);
		}
		if (
			!(await workspaceBelongsToOrganization(
				workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const revoked = await revokeApiKey(workspaceId, c.req.param("id"));
		if (!revoked) return respondError(c, "NOT_FOUND", "Key not found.", 404);
		return respond(c, { revoked: true });
	});

	app.get("/v1/account/api-keys", keys, async (c) => {
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"workspaceId is required.",
				400,
			);
		}
		if (
			!(await workspaceBelongsToOrganization(
				workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		return respond(c, { items: await listApiKeys(workspaceId) });
	});

	// ---- Billing ------------------------------------------------------------

	/** The plan in force and what it currently allows. Read-only. */
	app.get(
		"/v1/account/plan",
		authorizeAccount(options.platform, { capability: "workspace.view" }),
		async (c) => {
			const { organizationId } = c.get("account");
			const [planId, subscription, usage] = await Promise.all([
				getAccountPlanId(organizationId),
				getSubscriptionForOrg(organizationId),
				getUsage({ scopeId: organizationId }),
			]);
			return respond(c, {
				planId,
				subscription: subscription ?? null,
				usage,
			});
		},
	);

	/**
	 * Begin a subscription.
	 *
	 * Returns a client secret for Stripe Elements. **No plan change is applied
	 * here** — it lands when Stripe's webhook confirms payment, so an abandoned
	 * checkout can never leave an account on a plan nobody paid for.
	 */
	app.post("/v1/account/subscription", billing, async (c) => {
		const input = startSubscriptionSchema.parse(await c.req.json());
		try {
			const result = await createSubscriptionForPaymentElement({
				organizationId: c.get("account").organizationId,
				billingEmail: input.billingEmail,
				billingName: input.billingName,
				planId: input.planId as Parameters<
					typeof createSubscriptionForPaymentElement
				>[0]["planId"],
				cycle: input.cycle,
				seats: input.seats,
			});
			return respond(c, result, 201);
		} catch (error) {
			// A missing price is our misconfiguration, not the caller's mistake, and
			// saying so plainly beats a 500 nobody can act on.
			if (error instanceof Error && error.message.includes("No Stripe price")) {
				return respondError(
					c,
					"DEPENDENCY_UNAVAILABLE",
					"That plan is not available for checkout yet.",
					503,
				);
			}
			throw error;
		}
	});

	// ---- Notifications ------------------------------------------------------

	// Scoped to the caller, not the organization: a notification belongs to a
	// person, and the data layer matches on user id as well as notification id so
	// one user can never mark another's as read.
	app.post("/v1/account/notifications/:id/read", session, async (c) => {
		await markNotificationRead(c.get("account").userId, c.req.param("id"));
		return respond(c, { read: true });
	});

	app.post("/v1/account/notifications/read-all", session, async (c) => {
		await markAllNotificationsRead(c.get("account").userId);
		return respond(c, { read: true });
	});

	// ---- Account deletion ---------------------------------------------------

	/**
	 * Permanently delete the signed-in account.
	 *
	 * 🔴 **Irreversible, and only ever the caller's own account** — the user id
	 * comes from the session and is never accepted as a parameter, so this cannot
	 * be pointed at somebody else.
	 *
	 * Refused while any owned workspace still holds stored files: deleting the
	 * rows would orphan the bytes in blob storage, billed forever and attached to
	 * nobody.
	 */
	app.delete("/v1/account", session, async (c) => {
		try {
			await deleteUserAccount(c.get("account").userId);
			return respond(c, { deleted: true });
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "ACCOUNT_HAS_STORED_FILES"
			) {
				return respondError(
					c,
					"CONFLICT",
					"Delete the files in your workspaces before deleting your account.",
					409,
				);
			}
			throw error;
		}
	});
}
