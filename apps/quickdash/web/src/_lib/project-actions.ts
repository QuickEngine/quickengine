import type {
	QuickProjectStatus,
	QuickTaskPriority,
	QuickTaskStatus,
} from "@quickengine/quick/browser";
import { workspaceApi } from "../lib/api";
import type { QuickDashContext } from "../lib/quickdash-api";
import {
	type ActionState,
	actionResult,
	idempotencyKey,
} from "./action-result";

export type ProjectActionState = ActionState;
const optional = (value: FormDataEntryValue | null) =>
	String(value ?? "").trim() || null;

export function createProjectAction(
	_previous: ProjectActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(async () => {
		const clientId = optional(form.get("clientId"));
		const context = (await api.request<QuickDashContext>("/quickdash/context"))
			.data;
		const settings = context.modules.find(
			(module) => module.id === "projects-tasks",
		)?.settings as { allowInternalProjects?: boolean } | undefined;
		if (settings?.allowInternalProjects === false && !clientId) {
			throw new Error("Choose a client for this project.");
		}
		await api.projects.create(
			{
				clientId,
				name: String(form.get("name") ?? ""),
				description: optional(form.get("description")),
				startDate: optional(form.get("startDate")),
				dueDate: optional(form.get("dueDate")),
				status: "draft",
			},
			idempotencyKey(form),
		);
	}, "Check the project name, client, and dates.");
}

export function createTaskAction(
	_previous: ProjectActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(async () => {
		const context = (await api.request<QuickDashContext>("/quickdash/context"))
			.data;
		const settings = context.modules.find(
			(module) => module.id === "projects-tasks",
		)?.settings as { defaultTaskPriority?: QuickTaskPriority } | undefined;
		await api.request("/tasks", {
			method: "POST",
			body: {
				projectId: String(form.get("projectId") ?? ""),
				title: String(form.get("title") ?? ""),
				description: optional(form.get("description")),
				kind: String(form.get("kind") ?? "task"),
				priority:
					(String(form.get("priority") ?? "") as QuickTaskPriority) ||
					settings?.defaultTaskPriority ||
					"normal",
				dueDate: optional(form.get("dueDate")),
				status: "todo",
			},
			idempotencyKey: idempotencyKey(form),
		});
	}, "Check the task details and ensure the project is open.");
}

export function projectStatusAction(
	_previous: ProjectActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.projects.setStatus(
				String(form.get("id") ?? ""),
				String(form.get("target")) as QuickProjectStatus,
				idempotencyKey(form),
			),
		"That project transition is not available.",
	);
}

export function taskStatusAction(
	_previous: ProjectActionState,
	form: FormData,
) {
	const api = workspaceApi(String(form.get("workspaceId") ?? ""));
	return actionResult(
		() =>
			api.projects.tasks.setStatus(
				String(form.get("id") ?? ""),
				String(form.get("target")) as QuickTaskStatus,
				idempotencyKey(form),
			),
		"That task transition is not available.",
	);
}
