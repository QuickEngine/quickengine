"use server";

import { getSession } from "@quickengine/auth/server";
import { and, db, eq } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

	try {
		await createWorkspaceForUser({
			userId: session.user.id,
			userLabel: session.user.name ?? session.user.email,
			name,
			businessType,
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

	const [updated] = await db
		.update(quickengineWorkspaces)
		.set({ name, updatedAt: new Date() })
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.slug, slug),
				eq(quickengineWorkspaces.ownerId, session.user.id),
			),
		)
		.returning({ id: quickengineWorkspaces.id });
	if (!updated) {
		return { error: "Workspace not found.", success: false };
	}

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

	const [updated] = await db
		.update(quickengineWorkspaces)
		.set({
			archivedAt: archivedValue === "true" ? new Date() : null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.slug, slug),
				eq(quickengineWorkspaces.ownerId, session.user.id),
			),
		)
		.returning({ id: quickengineWorkspaces.id });
	if (!updated) {
		return { error: "Workspace not found.", success: false };
	}

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
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			archivedAt: quickengineWorkspaces.archivedAt,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.slug, slug),
				eq(quickengineWorkspaces.ownerId, session.user.id),
			),
		)
		.limit(1);
	if (!workspace) {
		return { error: "Workspace not found." };
	}
	if (!workspace.archivedAt) {
		return { error: "Archive this workspace before permanently deleting it." };
	}
	if (confirmation !== workspace.name) {
		return { error: "The workspace name does not match." };
	}

	const [deleted] = await db
		.delete(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspace.id),
				eq(quickengineWorkspaces.ownerId, session.user.id),
			),
		)
		.returning({ id: quickengineWorkspaces.id });
	if (!deleted) {
		return { error: "Workspace deletion failed. Nothing was removed." };
	}

	revalidatePath("/");
	redirect("/");
}
