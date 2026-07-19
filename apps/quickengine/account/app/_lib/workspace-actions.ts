"use server";

import { can } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import { db, eq, fileDocuments } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import {
	disableWorkspaceModule,
	enableWorkspaceModule,
} from "@quickengine/module-registry";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveActiveOrg } from "./active-org";
import { authorizeWorkspace } from "./workspace-authz";
import { getBusinessType } from "./workspace-catalog";
import { normalizeWorkspaceName } from "./workspace-input";
import { createWorkspaceForUser } from "./workspaces";

export type CreateWorkspaceState = { error: string | null };
export type RenameWorkspaceState = { error: string | null; success: boolean };
export type WorkspaceLifecycleState = {
	error: string | null;
	success: boolean;
};
export type DeleteWorkspaceState = { error: string | null };
export type WorkspaceModuleState = { error: string | null; success: boolean };

export async function createWorkspaceAction(
	_previous: CreateWorkspaceState,
	formData: FormData,
): Promise<CreateWorkspaceState> {
	const session = await getSession(await headers());
	if (!session) {
		return { error: "Your session expired. Please sign in again." };
	}

	const name = String(formData.get("name") ?? "");
	const businessType = String(formData.get("businessType") ?? "");
	const creationMode = String(formData.get("creationMode") ?? "preset");
	if (!getBusinessType(businessType)) {
		return { error: "Choose a valid business type." };
	}
	if (creationMode !== "preset" && creationMode !== "custom") {
		return { error: "Choose preset or custom configuration." };
	}

	const activeOrg = await resolveActiveOrg(session.user.id);
	if (!activeOrg) {
		return { error: "No active organization was found." };
	}
	if (!can(activeOrg.role, "workspace.manage")) {
		return {
			error:
				"You do not have permission to create a workspace in this organization.",
		};
	}

	try {
		await createWorkspaceForUser({
			userId: session.user.id,
			userLabel: session.user.name ?? session.user.email,
			name,
			businessType,
			organizationId: activeOrg.id,
		});
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "WORKSPACE_NAME_REQUIRED") {
				return { error: "Enter a workspace name." };
			}
			if (error.message === "WORKSPACE_NAME_TOO_LONG") {
				return { error: "Workspace names must be 120 characters or fewer." };
			}
		}
		return { error: "We couldn't create the workspace. Please try again." };
	}

	revalidatePath("/");
	redirect("/");
}

export async function renameWorkspaceAction(
	_previous: RenameWorkspaceState,
	formData: FormData,
): Promise<RenameWorkspaceState> {
	const session = await getSession(await headers());
	if (!session) {
		return {
			error: "Your session expired. Please sign in again.",
			success: false,
		};
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const authz = await authorizeWorkspace(
		session.user.id,
		workspaceId,
		slug,
		"workspace.manage",
	);
	if (!authz.ok) {
		return { error: authz.message, success: false };
	}
	let name: string;
	try {
		name = normalizeWorkspaceName(String(formData.get("name") ?? ""));
	} catch (error) {
		return {
			error:
				error instanceof Error && error.message === "WORKSPACE_NAME_TOO_LONG"
					? "Workspace names must be 120 characters or fewer."
					: "Enter a workspace name.",
			success: false,
		};
	}

	await db
		.update(quickengineWorkspaces)
		.set({ name, updatedAt: new Date() })
		.where(eq(quickengineWorkspaces.id, authz.workspace.id));

	revalidatePath("/");
	revalidatePath(`/workspaces/${slug}`);
	return { error: null, success: true };
}

export async function setWorkspaceArchivedAction(
	_previous: WorkspaceLifecycleState,
	formData: FormData,
): Promise<WorkspaceLifecycleState> {
	const session = await getSession(await headers());
	if (!session) {
		return {
			error: "Your session expired. Please sign in again.",
			success: false,
		};
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const archivedValue = String(formData.get("archived") ?? "");
	if (archivedValue !== "true" && archivedValue !== "false") {
		return { error: "Invalid workspace status.", success: false };
	}
	const authz = await authorizeWorkspace(
		session.user.id,
		workspaceId,
		slug,
		"workspace.manage",
	);
	if (!authz.ok) {
		return { error: authz.message, success: false };
	}

	await db
		.update(quickengineWorkspaces)
		.set({
			archivedAt: archivedValue === "true" ? new Date() : null,
			updatedAt: new Date(),
		})
		.where(eq(quickengineWorkspaces.id, authz.workspace.id));

	revalidatePath("/");
	revalidatePath(`/workspaces/${slug}`);
	return { error: null, success: true };
}

export async function deleteWorkspaceAction(
	_previous: DeleteWorkspaceState,
	formData: FormData,
): Promise<DeleteWorkspaceState> {
	const session = await getSession(await headers());
	if (!session) {
		return { error: "Your session expired. Please sign in again." };
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const confirmation = String(formData.get("confirmation") ?? "");
	const authz = await authorizeWorkspace(
		session.user.id,
		workspaceId,
		slug,
		"workspace.delete",
	);
	if (!authz.ok) {
		return { error: authz.message };
	}
	const workspace = authz.workspace;
	if (!workspace.archivedAt) {
		return { error: "Archive this workspace before permanently deleting it." };
	}
	if (confirmation !== workspace.name) {
		return { error: "The workspace name does not match." };
	}
	const [storedFile] = await db
		.select({ id: fileDocuments.id })
		.from(fileDocuments)
		.where(eq(fileDocuments.workspaceId, workspace.id))
		.limit(1);
	if (storedFile) {
		return {
			error:
				"Permanently delete this workspace's stored files before deleting the workspace.",
		};
	}

	const [deleted] = await db
		.delete(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspace.id))
		.returning({ id: quickengineWorkspaces.id });
	if (!deleted) {
		return { error: "Workspace deletion failed. Nothing was removed." };
	}

	revalidatePath("/");
	redirect("/");
}

export async function setWorkspaceModuleEnabledAction(
	_previous: WorkspaceModuleState,
	formData: FormData,
): Promise<WorkspaceModuleState> {
	const session = await getSession(await headers());
	if (!session) {
		return {
			error: "Your session expired. Please sign in again.",
			success: false,
		};
	}

	const workspaceId = String(formData.get("workspaceId") ?? "");
	const slug = String(formData.get("slug") ?? "");
	const moduleId = String(formData.get("moduleId") ?? "");
	const enabledValue = String(formData.get("enabled") ?? "");
	if (enabledValue !== "true" && enabledValue !== "false") {
		return { error: "Invalid module status.", success: false };
	}

	const authz = await authorizeWorkspace(
		session.user.id,
		workspaceId,
		slug,
		"modules.manage",
	);
	if (!authz.ok) {
		return { error: authz.message, success: false };
	}
	const workspace = authz.workspace;
	if (workspace.archivedAt) {
		return {
			error: "Restore this workspace before changing its modules.",
			success: false,
		};
	}

	try {
		if (enabledValue === "true") {
			await enableWorkspaceModule(workspace.id, moduleId);
		} else {
			await disableWorkspaceModule(workspace.id, moduleId);
		}
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.startsWith("MODULE_REQUIRED_BY:")) {
				return {
					error: "Another enabled module depends on this module.",
					success: false,
				};
			}
		}
		return { error: "We couldn't update this module.", success: false };
	}

	revalidatePath("/");
	revalidatePath(`/workspaces/${slug}`);
	return { error: null, success: true };
}
