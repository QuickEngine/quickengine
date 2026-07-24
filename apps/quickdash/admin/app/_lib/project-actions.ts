"use server";
import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	createProjectCommand,
	createTaskCommand,
	projectsTasksSettingsSchema,
	setProjectStatusCommand,
	setTaskStatusCommand,
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
		access,
		actorId: session.user.id,
		settings: projectsTasksSettingsSchema.parse(mod.settings),
	} as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof auth>>, { ok: true }>,
	operation: string,
	idempotencyKey: string,
	canonicalInput: unknown,
) {
	return {
		abortSignal: new AbortController().signal,
		actor: { id: authorization.actorId, type: "user" as const },
		deadlineAtMs: Date.now() + 10_000,
		fingerprint: await fingerprintCanonicalInput(canonicalInput),
		idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
		operation,
		organizationId: authorization.access.organizationId,
		requestId: crypto.randomUUID(),
		source: "quickdash" as const,
		workspaceId: authorization.access.workspace.id,
	};
}

const outcomeFailure = (kind: "conflict" | "in_progress") =>
	fail(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This change is still being processed. Try again shortly.",
	);

const key = (f: FormData) => String(f.get("idempotencyKey") ?? "");

// Durable commands raise DomainError with copy already written for a person.
const message = (error: unknown, fallback: string) =>
	error instanceof Error && error.name === "DomainError"
		? error.message
		: fallback;

const opt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function createProjectAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const clientId = opt(f.get("clientId"));
	if (!a.settings.allowInternalProjects && !clientId)
		return fail("Choose a client for this project.");
	try {
		const input = {
			clientId,
			name: String(f.get("name") ?? ""),
			description: opt(f.get("description")),
			startDate: opt(f.get("startDate")),
			dueDate: opt(f.get("dueDate")),
			status: "draft" as const,
		};
		const context = await mutationContext(a, "projects.create", key(f), input);
		const outcome = await createProjectCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "Check the project name, client, and dates."));
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}

export async function createTaskAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	try {
		const input = {
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
			status: "todo" as const,
		};
		const context = await mutationContext(a, "tasks.create", key(f), input);
		const outcome = await createTaskCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(
			message(error, "Check the task details and ensure the project is open."),
		);
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}

export async function projectStatusAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const id = String(f.get("id"));
	try {
		const status = String(f.get("target")) as never;
		const context = await mutationContext(a, "projects.set-status", key(f), {
			id,
			status,
		});
		const outcome = await setProjectStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "That project transition is not available."));
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}

export async function taskStatusAction(_: ProjectActionState, f: FormData) {
	const w = String(f.get("workspaceId") ?? "");
	const a = await auth(w);
	if (!a.ok) return fail(a.error);
	const id = String(f.get("id"));
	try {
		const status = String(f.get("target")) as never;
		const context = await mutationContext(a, "tasks.set-status", key(f), {
			id,
			status,
		});
		const outcome = await setTaskStatusCommand(context, id, status);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return fail(message(error, "That task transition is not available."));
	}
	revalidatePath(`/${w}/projects-tasks`);
	return ok();
}
