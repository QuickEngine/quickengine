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

/** The capabilities a role holds. Later this can be backed by DB rows for custom roles. */
export function capabilitiesFor(
	role: WorkspaceRole,
): readonly WorkspaceCapability[] {
	return ROLE_CAPABILITIES[role];
}

/** The single authorization predicate. Check capabilities, never role names. */
export function can(
	role: WorkspaceRole,
	capability: WorkspaceCapability,
): boolean {
	return ROLE_CAPABILITIES[role].includes(capability);
}
