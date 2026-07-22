"use server";

import { getSession } from "@quickengine/auth/server";
import { saveFirstActionChecklistState } from "@quickengine/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type FirstActionChecklistActionResult =
	| { ok: true }
	| { ok: false; error: string };

export async function saveFirstActionChecklistPresentationAction(input: {
	workspaceId: string;
	collapsed: boolean;
	dismissed: boolean;
}): Promise<FirstActionChecklistActionResult> {
	const session = await getSession(await headers());
	if (!session)
		return { ok: false, error: "Sign in to update this checklist." };
	const access = await requireWorkspaceAccess(
		session.user.id,
		input.workspaceId,
	);
	if (!access) return { ok: false, error: "Workspace access is required." };

	await saveFirstActionChecklistState({
		userId: session.user.id,
		workspaceId: access.workspace.id,
		collapsed: input.collapsed,
		dismissed: input.dismissed,
	});
	revalidatePath(`/${access.workspace.id}`, "layout");
	return { ok: true };
}
