import {
	createWorkspaceForUser,
	deleteWorkspace,
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

			try {
				const workspace = await createWorkspaceForUser({
					userId,
					userLabel: userId,
					name: input.name,
					businessType: input.businessType,
					modules,
					organizationId: input.organizationId,
				});
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
