"use server";
import { getSession } from "@quickengine/auth/server";
import {
	createProject,
	createTask,
	projectsTasksSettingsSchema,
	setProjectStatus,
	setTaskStatus,
} from "@quickengine/mod-projects-tasks";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";
export type ProjectActionState = {
	error: string | null;
	completionId: string | null;
};
const fail = (error: string): ProjectActionState => ({
	error,
	completionId: null,
});
const ok = (): ProjectActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
});
async function auth(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) return { ok: false, error: "Your session expired." } as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	const mod = access?.modules.find((m) => m.id === "projects-tasks");
	if (!access || !mod)
		return { ok: false, error: "Projects & Tasks is not enabled." } as const;
	return {
		ok: true,
		settings: projectsTasksSettingsSchema.parse(mod.settings),
	} as const;
}
const opt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
export async function createProjectAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const clientId = opt(f.get("clientId"));
	if (!a.settings.allowInternalProjects && !clientId)
		return fail("Choose a client for this project.");
	try {
		await createProject(w, {
			clientId,
			name: String(f.get("name") ?? ""),
			description: opt(f.get("description")),
			startDate: opt(f.get("startDate")),
			dueDate: opt(f.get("dueDate")),
			status: "draft",
		});
	} catch {
		return fail("Check the project name, client, and dates.");
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}
export async function createTaskAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		await createTask(w, {
			projectId: String(f.get("projectId") ?? ""),
			title: String(f.get("title") ?? ""),
			description: opt(f.get("description")),
			kind: String(f.get("kind")) as "task" | "deliverable",
			priority: String(f.get("priority") ?? a.settings.defaultTaskPriority) as
				| "low"
				| "normal"
				| "high"
				| "urgent",
			dueDate: opt(f.get("dueDate")),
			status: "todo",
		});
	} catch {
		return fail("Check the task details and ensure the project is open.");
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}
export async function projectStatusAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		await setProjectStatus(
			w,
			String(f.get("id")),
			String(f.get("target")) as never,
		);
	} catch {
		return fail("That project transition is not available.");
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}
export async function taskStatusAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		await setTaskStatus(
			w,
			String(f.get("id")),
			String(f.get("target")) as never,
		);
	} catch {
		return fail("That task transition is not available.");
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}
