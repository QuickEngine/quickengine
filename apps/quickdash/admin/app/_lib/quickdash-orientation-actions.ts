"use server";

import { getSession } from "@quickengine/auth/server";
import {
	restartQuickDashOrientation,
	saveQuickDashOrientationOutcome,
} from "@quickengine/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type QuickDashOrientationActionResult =
	| { ok: true }
	| { ok: false; error: string };

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) return null;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) return null;
	return { userId: session.user.id, workspaceId: access.workspace.id };
}

export async function saveQuickDashOrientationAction(input: {
	workspaceId: string;
	outcome: "completed" | "skipped";
}): Promise<QuickDashOrientationActionResult> {
	const authorized = await authorize(input.workspaceId);
	if (!authorized) return { ok: false, error: "Workspace access is required." };
	await saveQuickDashOrientationOutcome({
		...authorized,
		outcome: input.outcome,
	});
	revalidatePath(`/${authorized.workspaceId}`, "layout");
	return { ok: true };
}

export async function restartQuickDashOrientationAction(
	workspaceId: string,
): Promise<QuickDashOrientationActionResult> {
	const authorized = await authorize(workspaceId);
	if (!authorized) return { ok: false, error: "Workspace access is required." };
	await restartQuickDashOrientation(authorized.userId, authorized.workspaceId);
	revalidatePath(`/${authorized.workspaceId}`, "layout");
	return { ok: true };
}
