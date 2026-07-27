import {
	canGrantCapabilities,
	isBuiltInRole,
	WORKSPACE_CAPABILITIES,
} from "@quickengine/auth/rbac";
import type { CacheProvider } from "@quickengine/cache";
import {
	countMembersWithRole,
	createOrgRole,
	deleteOrgRole,
	listOrgRoles,
	updateOrgRole,
} from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * Custom roles an organization defines for itself.
 *
 * **A role is a name plus a list of permissions, and only the list means anything.**
 * Nothing in the product branches on a role's name, so an organization can call one
 * whatever it likes and the authorization path is unaffected.
 *
 * **Org-scoped, reached through a workspace.** Roles belong to the organization that
 * owns the workspace, not to the workspace — so `"Bookkeeper"` means the same thing
 * everywhere that org operates. The workspace in the request is how the caller
 * proves access; the organization behind it is what gets modified.
 *
 * Three invariants live here rather than in a form, because a form only decides
 * what is convenient to attempt:
 *
 * 1. **Nobody grants a capability they do not hold.** Otherwise an admin mints a
 *    role carrying `billing.manage`, assigns it to themselves, and escalates.
 * 2. **Built-ins cannot be redefined.** `owner`, `admin`, and `member` live in code.
 *    A custom role taking one of those names would shadow it, and an organization
 *    could quietly strip its own billing access.
 * 3. **A role members still hold cannot be deleted.** They would resolve to no
 *    capabilities and lose access silently, with nothing explaining why.
 */

const capability = z.enum(
	WORKSPACE_CAPABILITIES as unknown as [string, ...string[]],
);

export const roleInputSchema = z.object({
	name: z.string().trim().min(1).max(50),
	description: z.string().trim().max(500).nullable().optional(),
	capabilities: z.array(capability).max(WORKSPACE_CAPABILITIES.length),
});

export const rolePatchSchema = roleInputSchema.partial();

export function registerRolesRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "roles:read",
		sessionCapability: "members.manage",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "roles:write",
		sessionCapability: "members.manage",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "roles.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "roles.write",
	});

	/** The organization behind the authorized workspace, or a 400 if there is none. */
	const orgOf = (c: {
		get: (k: "authorized") => { workspace: { organizationId: string | null } };
	}) => c.get("authorized").workspace.organizationId;

	app.get("/v1/roles", readAccess, readLimit, async (c) => {
		const organizationId = orgOf(c);
		if (!organizationId) return respond(c, { items: [] });
		return respond(c, { items: await listOrgRoles(organizationId) });
	});

	app.post("/v1/roles", writeAccess, writeLimit, async (c) => {
		const organizationId = orgOf(c);
		if (!organizationId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"This workspace has no organization to define roles for.",
				400,
			);
		}
		const input = roleInputSchema.parse(await c.req.json());

		if (isBuiltInRole(input.name.toLowerCase())) {
			return respondError(
				c,
				"CONFLICT",
				`"${input.name}" is a built-in role and cannot be redefined.`,
				409,
			);
		}

		const held = c.get("authorized").workspace.capabilities ?? [];
		if (!canGrantCapabilities(held, input.capabilities)) {
			return respondError(
				c,
				"CAPABILITY_DENIED",
				"You cannot grant a permission you do not hold yourself.",
				403,
			);
		}

		try {
			const role = await createOrgRole({ organizationId, ...input });
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

	app.patch("/v1/roles/:id", writeAccess, writeLimit, async (c) => {
		const organizationId = orgOf(c);
		if (!organizationId) {
			return respondError(c, "NOT_FOUND", "Role not found.", 404);
		}
		const input = rolePatchSchema.parse(await c.req.json());

		if (input.name && isBuiltInRole(input.name.toLowerCase())) {
			return respondError(
				c,
				"CONFLICT",
				`"${input.name}" is a built-in role and cannot be redefined.`,
				409,
			);
		}

		if (input.capabilities) {
			const held = c.get("authorized").workspace.capabilities ?? [];
			if (!canGrantCapabilities(held, input.capabilities)) {
				return respondError(
					c,
					"CAPABILITY_DENIED",
					"You cannot grant a permission you do not hold yourself.",
					403,
				);
			}
		}

		const role = await updateOrgRole(organizationId, c.req.param("id"), input);
		if (!role) return respondError(c, "NOT_FOUND", "Role not found.", 404);
		return respond(c, role);
	});

	app.delete("/v1/roles/:id", writeAccess, writeLimit, async (c) => {
		const organizationId = orgOf(c);
		if (!organizationId) {
			return respondError(c, "NOT_FOUND", "Role not found.", 404);
		}

		const existing = (await listOrgRoles(organizationId)).find(
			(r) => r.id === c.req.param("id"),
		);
		if (!existing) return respondError(c, "NOT_FOUND", "Role not found.", 404);

		// Refuse rather than orphan. A member left holding a deleted role resolves to
		// no capabilities and loses access with nothing telling them why.
		const holders = await countMembersWithRole(organizationId, existing.name);
		if (holders > 0) {
			return respondError(
				c,
				"CONFLICT",
				`${holders} member${holders === 1 ? "" : "s"} still ${
					holders === 1 ? "holds" : "hold"
				} this role. Move them to another role first.`,
				409,
			);
		}

		await deleteOrgRole(organizationId, c.req.param("id"));
		return respond(c, { deleted: true });
	});
}
