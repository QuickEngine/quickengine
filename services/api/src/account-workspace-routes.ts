import { trackProductEvent } from "@quickengine/analytics";
import {
	admitWorkspace,
	syncSeats,
	syncWorkspaces,
} from "@quickengine/billing";
import {
	createWorkspaceForUser,
	deleteWorkspace,
	nameOrganizationFromBusiness,
	recordControlPlaneAudit,
	renameWorkspace,
	setWorkspaceArchived,
	setWorkspaceModuleEnabled,
	workspaceBelongsToOrganization,
} from "@quickengine/db";
import {
	getModule,
	resolveFoundationModules,
	resolveModules,
} from "@quickengine/module-registry";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeAccount, authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * Workspace management.
 *
 * These were Next server actions writing straight to the database, which meant
 * **a customer could not create a workspace through the API at all** — only by
 * clicking in our own app. For a product whose pitch is "drive it from your own
 * frontend", that was a hole, not just migration debt.
 *
 * Account-level, so they authorise by **session and organization**, never by API
 * key: a key belongs to one workspace, and letting it create or delete
 * workspaces would turn a single leaked key into control of the account.
 */

export const createWorkspaceSchema = z.object({
	name: z.string().trim().min(1).max(120),
	businessType: z.string().trim().min(1),
	moduleIds: z.array(z.string()).optional(),
	organizationId: z.string().uuid().optional(),
	completeOnboarding: z.boolean().optional(),
});

export const renameWorkspaceSchema = z.object({
	name: z.string().trim().min(1).max(120),
});
export const archiveWorkspaceSchema = z.object({ archived: z.boolean() });
export const workspaceModuleSchema = z.object({ enabled: z.boolean() });

/** Domain errors the data layer throws, mapped to something a caller can act on. */
function messageFor(
	error: unknown,
): { code: "VALIDATION_ERROR"; message: string } | null {
	if (!(error instanceof Error)) return null;
	switch (error.message) {
		case "WORKSPACE_NAME_TOO_LONG":
			return {
				code: "VALIDATION_ERROR",
				message: "Workspace names must be 120 characters or fewer.",
			};
		case "WORKSPACE_NAME_REQUIRED":
			return { code: "VALIDATION_ERROR", message: "Enter a workspace name." };
		case "UNKNOWN_MODULE":
			return {
				code: "VALIDATION_ERROR",
				message: "That module does not exist.",
			};
		default:
			return null;
	}
}

export function registerAccountWorkspaceRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const manage = authorizeAccount(options.platform, {
		capability: "workspace.manage",
	});
	const remove = authorizeAccount(options.platform, {
		capability: "workspace.delete",
	});
	const modules = authorizeAccount(options.platform, {
		capability: "modules.manage",
	});
	const ownsTarget = async (workspaceId: string, organizationId: string) =>
		workspaceBelongsToOrganization(workspaceId, organizationId);

	/**
	 * Create a workspace.
	 *
	 * Uses a session rather than an organization guard because the very first
	 * workspace is created before the user belongs to anything — the data layer
	 * falls back to their personal organization.
	 */
	app.post(
		"/v1/account/workspaces",
		authorizeSession(options.platform),
		async (c) => {
			const input = createWorkspaceSchema.parse(await c.req.json());
			const { userId } = c.get("account");

			// Resolved here, not in the data layer. Unknown ids are dropped rather
			// than rejected because this input crosses a trust boundary from the
			// browser, and dependency resolution means enabling a module that builds
			// on another brings its prerequisite along. No choice at all falls back
			// to the foundation set.
			const requested = (input.moduleIds ?? []).filter((id) => getModule(id));
			const modules =
				requested.length > 0
					? resolveModules(requested)
					: resolveFoundationModules();

			// ⚠️ Only checked when the caller names an organization. Onboarding does
			// not: it creates the first workspace in a personal org resolved inside
			// the data layer, and a first workspace is exactly what every plan
			// includes. Gating a path whose answer is always "yes" would only risk
			// blocking signup.
			if (input.organizationId) {
				const room = await admitWorkspace(input.organizationId);
				if (!room.allowed) {
					return respondError(
						c,
						"USAGE_LIMIT_EXCEEDED",
						`Your plan includes ${room.limit} workspace${room.limit === 1 ? "" : "s"}. Upgrade your plan or delete one to create another.`,
						402,
					);
				}
			}

			try {
				const workspace = await createWorkspaceForUser({
					userId,
					userLabel: userId,
					name: input.name,
					businessType: input.businessType,
					modules,
					organizationId: input.organizationId,
					completeOnboarding: input.completeOnboarding,
				});
				// Onboarding only: the business name the customer typed names their
				// organisation, not just the workspace. Runs after the workspace commits
				// so a failure here cannot leave a half-created workspace behind — a
				// wrongly-named org is recoverable, a missing workspace is not.
				if (input.completeOnboarding) {
					await nameOrganizationFromBusiness(userId, input.name);
				}

				if (!workspace) {
					// Onboarding already ran. Replaying it would create a duplicate first
					// workspace, so this is a conflict rather than a silent success.
					return respondError(
						c,
						"CONFLICT",
						"This account already has its first workspace.",
						409,
					);
				}
				// The count moved. `workspace.organizationId` rather than the caller's,
				// because onboarding creates the workspace under the personal org the
				// data layer resolved, which is not always the one on the request.
				await syncWorkspaces(workspace.organizationId);
				// 🔴 Also seats, and this path is the ONLY one that initialises them for
				// a real account. `syncSeats` is otherwise called from organization
				// creation, member add and member remove — none of which onboarding
				// touches, because it creates the personal org inside the data layer via
				// `ensurePersonalOrg`. Without this every signed-up account records
				// `seats = 0` forever: the gate still holds (it counts members directly)
				// but the usage dashboard reads zero and a per-seat plan falls back to
				// its floor instead of the real headcount. Found in production on
				// 2026-08-01, not by any test.
				await syncSeats(workspace.organizationId);

				// The line between an account and a user. Fire-and-forget: telemetry
				// must never be able to fail a workspace creation.
				trackProductEvent({
					name: "workspace.created",
					surface: "account",
					userId,
					organizationId: workspace.organizationId,
					workspaceId: workspace.id,
					// Dimensions only — the business TYPE tells us which recipes work,
					// the business NAME would be customer content.
					properties: {
						businessType: workspace.businessType,
						moduleCount: workspace.moduleIds.length,
						onboarding: Boolean(input.completeOnboarding),
					},
				});
				if (input.completeOnboarding) {
					trackProductEvent({
						name: "onboarding.completed",
						surface: "account",
						userId,
						organizationId: workspace.organizationId,
						workspaceId: workspace.id,
					});
				}
				return respond(c, workspace, 201);
			} catch (error) {
				const mapped = messageFor(error);
				if (mapped) return respondError(c, mapped.code, mapped.message, 400);
				throw error;
			}
		},
	);

	app.patch("/v1/account/workspaces/:id", manage, async (c) => {
		if (
			!(await ownsTarget(c.req.param("id"), c.get("account").organizationId))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const input = renameWorkspaceSchema.parse(await c.req.json());
		try {
			const workspace = await renameWorkspace(c.req.param("id"), input.name);
			if (!workspace) {
				return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
			}
			return respond(c, workspace);
		} catch (error) {
			const mapped = messageFor(error);
			if (mapped) return respondError(c, mapped.code, mapped.message, 400);
			throw error;
		}
	});

	app.post("/v1/account/workspaces/:id/archive", manage, async (c) => {
		if (
			!(await ownsTarget(c.req.param("id"), c.get("account").organizationId))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const input = archiveWorkspaceSchema.parse(await c.req.json());
		const workspace = await setWorkspaceArchived(
			c.req.param("id"),
			input.archived,
		);
		if (!workspace) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		return respond(c, workspace);
	});

	/**
	 * Permanently delete a workspace.
	 *
	 * Separate capability from renaming: `workspace.delete` is owner-only, because
	 * this destroys every record the business ever created and archiving exists
	 * for every reversible case.
	 */
	app.delete("/v1/account/workspaces/:id", remove, async (c) => {
		if (
			!(await ownsTarget(c.req.param("id"), c.get("account").organizationId))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const workspace = await deleteWorkspace(c.req.param("id"));
		if (!workspace) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		// Without this a deleted workspace keeps occupying its slot, and a customer
		// on Launch could delete all three and still be told they are at the limit.
		// The column is nullable for legacy rows; there is nothing to recount when
		// a workspace belonged to no organization.
		if (workspace.organizationId) {
			await syncWorkspaces(workspace.organizationId);
			await recordControlPlaneAudit({
				organizationId: workspace.organizationId,
				actorId: c.get("account").userId,
				actorType: "user",
				action: "workspace.deleted",
				resourceType: "workspace",
				resourceId: workspace.id,
				requestId: c.get("requestId"),
				metadata: { name: workspace.name },
			});
		}
		return respond(c, { deleted: true });
	});

	app.put(
		"/v1/account/workspaces/:id/modules/:moduleId",
		modules,
		async (c) => {
			if (
				!(await ownsTarget(c.req.param("id"), c.get("account").organizationId))
			) {
				return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
			}
			const input = workspaceModuleSchema.parse(await c.req.json());
			const moduleId = c.req.param("moduleId");
			if (!getModule(moduleId)) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"That module does not exist.",
					400,
				);
			}
			// Which of the fifteen modules anybody actually wants — the answer to
			// what to invest in and what to retire.
			trackProductEvent({
				name: "module.configured",
				surface: "account",
				userId: c.get("account").userId,
				organizationId: c.get("account").organizationId,
				workspaceId: c.req.param("id"),
				properties: { moduleId, enabled: input.enabled },
			});

			try {
				await setWorkspaceModuleEnabled({
					workspaceId: c.req.param("id"),
					moduleId,
					enabled: input.enabled,
					// Dependencies come along, so a workspace cannot end up in a
					// configuration that silently cannot work.
					resolvedModuleIds: resolveModules([moduleId]).map((m) => m.id),
				});
				return respond(c, { enabled: input.enabled });
			} catch (error) {
				const mapped = messageFor(error);
				if (mapped) return respondError(c, mapped.code, mapped.message, 400);
				throw error;
			}
		},
	);
}
