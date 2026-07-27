import type { QuickEngineOrgRole } from "@quickengine/db/schema/quickengine";

// Workspace authorization is CAPABILITY-based, never role-name based. Every call site asks
// `can(role, "some.capability")` — never `role === "admin"` — so the role list is never
// hardlocked. A role is just a named bundle of capabilities.
//
// - Today: the roles mirror the org-member roles (owner/admin/member) and the bundles are the
//   const below.
// - Add a role later (e.g. "moderator"): add it to QuickEngineOrgRole + one ROLE_CAPABILITIES
//   entry. TypeScript forces the entry (the Record must be exhaustive); no call site changes.
// - Custom roles + custom permissions later (Discord/Slack style): supply the same
//   role→capabilities shape from workspace-scoped DB rows instead of this const. Call sites,
//   which only ever check capabilities, don't change.
//
// This is the same capability model the API keys already use (`catalog:read`, `events:write`).

export type WorkspaceRole = QuickEngineOrgRole;

export const WORKSPACE_CAPABILITIES = [
	"workspace.view", // open the workspace and read its data
	"workspace.manage", // rename, archive, lifecycle
	"workspace.delete", // permanently delete
	"modules.manage", // enable/disable modules
	"members.manage", // invite/remove members, change roles
	"apikeys.manage", // create/revoke API keys
	"billing.manage", // billing and subscription
	"records.write", // operate the business (create/edit records)
] as const;
export type WorkspaceCapability = (typeof WORKSPACE_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<WorkspaceRole, readonly WorkspaceCapability[]> =
	{
		owner: [...WORKSPACE_CAPABILITIES],
		admin: [
			"workspace.view",
			"workspace.manage",
			"modules.manage",
			"members.manage",
			"apikeys.manage",
			"records.write",
		],
		member: ["workspace.view", "records.write"],
	};

/** The three roles every organization has. Present from day one, never deletable. */
export const BUILT_IN_ROLES = ["owner", "admin", "member"] as const;

export const isBuiltInRole = (name: string): name is WorkspaceRole =>
	(BUILT_IN_ROLES as readonly string[]).includes(name);

/** The capabilities a built-in role holds. */
export function capabilitiesFor(
	role: WorkspaceRole,
): readonly WorkspaceCapability[] {
	return ROLE_CAPABILITIES[role];
}

/**
 * Resolve any role name — built-in or custom — to its capabilities.
 *
 * **Built-ins are checked first and can never be shadowed.** A custom role called
 * "owner" must not be able to redefine what owner means, or an organization could
 * quietly strip its own billing access and lock itself out.
 *
 * A name that matches nothing resolves to **no capabilities**, not to a default.
 * A deleted role must fail closed: inheriting `member` would silently keep granting
 * access after an administrator removed the role precisely to revoke it.
 */
export function resolveCapabilities(
	roleName: string,
	customRoles: ReadonlyMap<string, readonly string[]>,
): readonly WorkspaceCapability[] {
	if (isBuiltInRole(roleName)) return ROLE_CAPABILITIES[roleName];
	const custom = customRoles.get(roleName.toLowerCase()) ?? [];
	// Filter rather than trust: a capability removed from the product must stop
	// granting anything, even while stale rows still name it.
	return custom.filter((c): c is WorkspaceCapability =>
		(WORKSPACE_CAPABILITIES as readonly string[]).includes(c),
	);
}

/**
 * Whether `granter` may create or edit a role holding `capabilities`.
 *
 * **Nobody may grant what they do not hold.** Without this an admin could mint a
 * role carrying `billing.manage`, assign it to themselves, and escalate — the
 * classic custom-roles privilege escalation, and the reason this check exists at
 * the domain layer rather than only in a form.
 *
 * `granter` is either a built-in role name or an already-resolved capability list.
 * The list form is what callers holding a **custom** role must pass: a role name
 * that is not one of the built-in three has no entry in `ROLE_CAPABILITIES`, and
 * resolving it to nothing would deny a user who legitimately holds the permission.
 */
export function canGrantCapabilities(
	granter: WorkspaceRole | readonly string[],
	capabilities: readonly string[],
): boolean {
	const held = new Set(
		typeof granter === "string" ? ROLE_CAPABILITIES[granter] : granter,
	);
	return capabilities.every((c) => held.has(c as WorkspaceCapability));
}

/** The single authorization predicate. Check capabilities, never role names. */
export function can(
	role: WorkspaceRole,
	capability: WorkspaceCapability,
): boolean {
	return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * The capability check for a resolved access record.
 *
 * Prefer this over `can()` anywhere a custom role can appear. `can()` only knows
 * the three built-ins, so a custom role passed to it resolves to nothing — which
 * fails closed, but silently denies a user who legitimately has the permission.
 */
export function holds(
	access: { capabilities: readonly WorkspaceCapability[] } | null | undefined,
	capability: WorkspaceCapability,
): boolean {
	return access?.capabilities.includes(capability) ?? false;
}

/**
 * A user's role on a workspace **and the capabilities it actually grants.**
 *
 * The name alone stopped being sufficient once organizations could define their own
 * roles: `"Bookkeeper"` means nothing without that org's definition of it. Callers
 * check capabilities and never names, so a role can be renamed, redefined, or
 * invented without touching a single authorization site.
 *
 * Lives here rather than in `@quickengine/db` because resolution needs both the
 * membership row and the capability rules, and db must not depend on auth.
 */
export async function resolveWorkspaceAccess(
	userId: string,
	workspace: { ownerId: string; organizationId: string | null },
): Promise<{
	role: string;
	capabilities: readonly WorkspaceCapability[];
} | null> {
	const { loadOrgRoleCapabilities, resolveWorkspaceRole } = await import(
		"@quickengine/db"
	);
	const role = await resolveWorkspaceRole(userId, workspace);
	if (!role) return null;
	// Built-ins resolve from code, so the common path costs no extra query — and a
	// custom role can never shadow `owner` and strip an org of its own billing.
	const custom = isBuiltInRole(role)
		? new Map<string, readonly string[]>()
		: await loadOrgRoleCapabilities(workspace.organizationId ?? "");
	return { role, capabilities: resolveCapabilities(role, custom) };
}

/**
 * A user's role on an **organization** and the capabilities it grants.
 *
 * The org-level twin of `resolveWorkspaceAccess`, for surfaces that authorize
 * against the organization itself rather than one of its workspaces — team
 * management, billing, and workspace creation.
 *
 * Callers must pair this with `holds`, never with `can`: `can` only knows the
 * three built-in roles, so a member holding a custom role would be denied a
 * permission they genuinely have.
 */
export async function resolveOrgAccess(
	userId: string,
	organizationId: string,
): Promise<{
	role: string;
	capabilities: readonly WorkspaceCapability[];
} | null> {
	const { loadOrgRoleCapabilities, resolveOrgRole } = await import(
		"@quickengine/db"
	);
	const role = await resolveOrgRole(userId, organizationId);
	if (!role) return null;
	const custom = isBuiltInRole(role)
		? new Map<string, readonly string[]>()
		: await loadOrgRoleCapabilities(organizationId);
	return { role, capabilities: resolveCapabilities(role, custom) };
}
