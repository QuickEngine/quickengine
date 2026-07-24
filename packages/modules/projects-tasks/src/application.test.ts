import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	archiveProjectCommand,
	createMilestoneCommand,
	createProjectCommand,
	createTaskCommand,
	deleteMilestoneCommand,
	deleteProjectCommand,
	deleteTaskCommand,
	restoreProjectCommand,
	setMilestoneStatusCommand,
	setProjectStatusCommand,
	setTaskStatusCommand,
	updateTaskCommand,
} from "./application";

const ownerId = "projects-owner";
const workspaceId = "00000000-0000-4000-8000-0000000016a1";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const idOf = (result: { kind: string; result?: unknown }) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

async function project(key: string, name = "Website rebuild") {
	const created = await createProjectCommand(context("projects.create", key), {
		name,
	});
	return idOf(created);
}

async function activeProject(key: string) {
	const id = await project(key);
	await setProjectStatusCommand(
		context("projects.set-status", `${key}-active`),
		id,
		"active",
	);
	return id;
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Projects Owner', 'projects@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Projects Workspace', 'agency')
	`;
});

describe("Projects durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createProjectCommand(
			context("projects.create", "prj-1"),
			{ name: "Website rebuild" },
		);
		const replay = await createProjectCommand(
			context("projects.create", "prj-1"),
			{ name: "Website rebuild" },
		);
		expect(first).toMatchObject({
			kind: "success",
			source: "executed",
			status: 201,
		});
		expect(replay).toMatchObject({
			kind: "success",
			source: "replayed",
			status: 201,
		});

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from projects where workspace_id = ${workspaceId}) projects,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			projects: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createProjectCommand(context("projects.create", "prj-2"), {
			name: "First",
		});
		const conflict = await createProjectCommand(
			context("projects.create", "prj-2", "different"),
			{ name: "Second" },
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("requires a project to be closed before archiving, and archived before deleting", async () => {
		const id = await activeProject("prj-3");

		await expect(
			archiveProjectCommand(context("projects.archive", "prj-3-early"), id),
		).rejects.toThrow(/Complete or cancel this project/);
		await expect(
			deleteProjectCommand(context("projects.delete", "prj-3-early-del"), id),
		).rejects.toThrow(/Archive this project/);

		await setProjectStatusCommand(
			context("projects.set-status", "prj-3-done"),
			id,
			"completed",
		);
		const archived = await archiveProjectCommand(
			context("projects.archive", "prj-3-archive"),
			id,
		);
		expect(archived).toMatchObject({ kind: "success", status: 200 });

		const deleted = await deleteProjectCommand(
			context("projects.delete", "prj-3-del"),
			id,
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});

	it("restores an archived project and refuses to restore a live one", async () => {
		const id = await activeProject("prj-4");
		await setProjectStatusCommand(
			context("projects.set-status", "prj-4-done"),
			id,
			"completed",
		);
		await archiveProjectCommand(context("projects.archive", "prj-4-arch"), id);

		const restored = await restoreProjectCommand(
			context("projects.restore", "prj-4-restore"),
			id,
		);
		expect(restored).toMatchObject({ kind: "success", status: 200 });

		await expect(
			restoreProjectCommand(context("projects.restore", "prj-4-again"), id),
		).rejects.toThrow(/isn't archived/);
	});
});

describe("Milestone and task hierarchy", () => {
	it("keeps a milestone from being deleted while it still holds tasks", async () => {
		const projectId = await activeProject("prj-5");
		const milestone = await createMilestoneCommand(
			context("milestones.create", "ms-5"),
			{ projectId, name: "Design" },
		);
		const milestoneId = idOf(milestone);
		await createTaskCommand(context("tasks.create", "tsk-5"), {
			projectId,
			milestoneId,
			title: "Wireframes",
		});

		await setMilestoneStatusCommand(
			context("milestones.set-status", "ms-5-cancel"),
			milestoneId,
			"cancelled",
		);
		await expect(
			deleteMilestoneCommand(
				context("milestones.delete", "ms-5-del"),
				milestoneId,
			),
		).rejects.toThrow(/still has tasks/);
	});

	it("refuses to make a task its own descendant", async () => {
		const projectId = await activeProject("prj-6");
		const parent = await createTaskCommand(context("tasks.create", "tsk-6a"), {
			projectId,
			title: "Parent",
		});
		const parentId = idOf(parent);
		const child = await createTaskCommand(context("tasks.create", "tsk-6b"), {
			projectId,
			parentTaskId: parentId,
			title: "Child",
		});
		const childId = idOf(child);

		// Re-parenting the parent under its own child would close a cycle.
		await expect(
			updateTaskCommand(context("tasks.update", "tsk-6-cycle"), parentId, {
				projectId,
				parentTaskId: childId,
				title: "Parent",
			}),
		).rejects.toThrow(/can't be made a descendant of itself/);
	});

	it("keeps a task from being deleted while it still has subtasks", async () => {
		const projectId = await activeProject("prj-7");
		const parent = await createTaskCommand(context("tasks.create", "tsk-7a"), {
			projectId,
			title: "Parent",
		});
		const parentId = idOf(parent);
		await createTaskCommand(context("tasks.create", "tsk-7b"), {
			projectId,
			parentTaskId: parentId,
			title: "Child",
		});

		await setTaskStatusCommand(
			context("tasks.set-status", "tsk-7-cancel"),
			parentId,
			"cancelled",
		);
		await expect(
			deleteTaskCommand(context("tasks.delete", "tsk-7-del"), parentId),
		).rejects.toThrow(/has subtasks/);
	});

	it("rejects a parent task from a different project", async () => {
		const projectA = await activeProject("prj-8a");
		const projectB = await activeProject("prj-8b");
		const foreign = await createTaskCommand(context("tasks.create", "tsk-8a"), {
			projectId: projectA,
			title: "Elsewhere",
		});

		await expect(
			createTaskCommand(context("tasks.create", "tsk-8b"), {
				projectId: projectB,
				parentTaskId: idOf(foreign),
				title: "Orphan",
			}),
		).rejects.toThrow(/different project/);
	});

	it("rolls the whole task back when its parent reference is invalid", async () => {
		const projectId = await activeProject("prj-9");

		await expect(
			createTaskCommand(context("tasks.create", "tsk-9"), {
				projectId,
				parentTaskId: "00000000-0000-4000-8000-0000000016ff",
				title: "Bad parent",
			}),
		).rejects.toThrow(/parent task was not found/);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from project_tasks where workspace_id = ${workspaceId}) tasks,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}
					and resource_type = 'task') audits
		`;
		expect(counts).toMatchObject({ tasks: 0, audits: 0 });
	});
});
