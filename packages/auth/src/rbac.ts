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
 */
export function canGrantCapabilities(
	granter: WorkspaceRole,
	capabilities: readonly string[],
): boolean {
	const held = new Set(ROLE_CAPABILITIES[granter]);
	return capabilities.every((c) => held.has(c as WorkspaceCapability));
}

/** The single authorization predicate. Check capabilities, never role names. */
export function can(
	role: WorkspaceRole,
	capability: WorkspaceCapability,
): boolean {
	return ROLE_CAPABILITIES[role].includes(capability);
}
