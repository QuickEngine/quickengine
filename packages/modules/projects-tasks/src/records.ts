import {
	and,
	asc,
	clientRecords,
	db,
	desc,
	eq,
	isNull,
	projectMilestones,
	projects,
	projectTasks,
	quickengineWorkspaces,
} from "@quickengine/db";
import {
	canTransitionMilestone,
	type MilestoneDetailsInput,
	type MilestoneInput,
	type MilestoneStatus,
	milestoneDetailsInputSchema,
	milestoneInputSchema,
} from "./milestone";
import {
	canTransitionProject,
	type ProjectDetailsInput,
	type ProjectInput,
	type ProjectStatus,
	projectDetailsInputSchema,
	projectInputSchema,
} from "./project";
import {
	canTransitionTask,
	type TaskDetailsInput,
	type TaskInput,
	type TaskStatus,
	taskDetailsInputSchema,
	taskInputSchema,
} from "./task";

type QueryExecutor = Pick<typeof db, "select">;

async function assertWorkspace(executor: QueryExecutor, workspaceId: string) {
	const [workspace] = await executor
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1)
		.for("update");
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
}

async function resolveClientSnapshot(
	executor: QueryExecutor,
	workspaceId: string,
	clientId: string | null,
) {
	if (!clientId) return { clientName: null, clientEmail: null };
	const [client] = await executor
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, clientId))
		.limit(1);
	if (!client) throw new Error("CLIENT_NOT_FOUND");
	if (client.workspaceId !== workspaceId) {
		throw new Error("CLIENT_WORKSPACE_MISMATCH");
	}
	return { clientName: client.name, clientEmail: client.email };
}

async function getProjectReference(
	executor: QueryExecutor,
	workspaceId: string,
	projectId: string,
) {
	const [project] = await executor
		.select({
			id: projects.id,
			workspaceId: projects.workspaceId,
			status: projects.status,
			archivedAt: projects.archivedAt,
		})
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1)
		.for("update");
	if (!project) throw new Error("PROJECT_NOT_FOUND");
	if (project.workspaceId !== workspaceId) {
		throw new Error("PROJECT_WORKSPACE_MISMATCH");
	}
	return project;
}

function assertProjectOperational(
	project: Awaited<ReturnType<typeof getProjectReference>>,
) {
	if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
	if (project.status === "completed" || project.status === "cancelled") {
		throw new Error("PROJECT_CLOSED");
	}
}

async function assertMilestoneReference(
	executor: QueryExecutor,
	workspaceId: string,
	projectId: string,
	milestoneId: string | null,
) {
	if (!milestoneId) return;
	const [milestone] = await executor
		.select({
			workspaceId: projectMilestones.workspaceId,
			projectId: projectMilestones.projectId,
			status: projectMilestones.status,
		})
		.from(projectMilestones)
		.where(eq(projectMilestones.id, milestoneId))
		.limit(1)
		.for("update");
	if (!milestone) throw new Error("MILESTONE_NOT_FOUND");
	if (milestone.workspaceId !== workspaceId) {
		throw new Error("MILESTONE_WORKSPACE_MISMATCH");
	}
	if (milestone.projectId !== projectId) {
		throw new Error("MILESTONE_PROJECT_MISMATCH");
	}
	if (milestone.status !== "open") throw new Error("MILESTONE_CLOSED");
}

async function getMilestoneProjectId(
	executor: QueryExecutor,
	workspaceId: string,
	id: string,
) {
	const [milestone] = await executor
		.select({ projectId: projectMilestones.projectId })
		.from(projectMilestones)
		.where(
			and(
				eq(projectMilestones.workspaceId, workspaceId),
				eq(projectMilestones.id, id),
			),
		)
		.limit(1);
	if (!milestone) throw new Error("MILESTONE_NOT_FOUND");
	return milestone.projectId;
}

async function getTaskProjectId(
	executor: QueryExecutor,
	workspaceId: string,
	id: string,
) {
	const [task] = await executor
		.select({ projectId: projectTasks.projectId })
		.from(projectTasks)
		.where(
			and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
		)
		.limit(1);
	if (!task) throw new Error("TASK_NOT_FOUND");
	return task.projectId;
}

async function assertParentTaskReference(
	executor: QueryExecutor,
	workspaceId: string,
	input: {
		projectId: string;
		milestoneId: string | null;
		parentTaskId: string | null;
	},
	taskId?: string,
) {
	if (!input.parentTaskId) return;
	const seen = new Set<string>();
	if (taskId) seen.add(taskId);
	let cursor: string | null = input.parentTaskId;
	while (cursor) {
		if (seen.has(cursor)) throw new Error("TASK_PARENT_CYCLE");
		seen.add(cursor);
		const [parent]: Array<{
			workspaceId: string;
			projectId: string;
			milestoneId: string | null;
			parentTaskId: string | null;
		}> = await executor
			.select({
				workspaceId: projectTasks.workspaceId,
				projectId: projectTasks.projectId,
				milestoneId: projectTasks.milestoneId,
				parentTaskId: projectTasks.parentTaskId,
			})
			.from(projectTasks)
			.where(eq(projectTasks.id, cursor))
			.limit(1);
		if (!parent) throw new Error("PARENT_TASK_NOT_FOUND");
		if (parent.workspaceId !== workspaceId) {
			throw new Error("PARENT_TASK_WORKSPACE_MISMATCH");
		}
		if (parent.projectId !== input.projectId) {
			throw new Error("PARENT_TASK_PROJECT_MISMATCH");
		}
		if (parent.milestoneId !== input.milestoneId) {
			throw new Error("PARENT_TASK_MILESTONE_MISMATCH");
		}
		cursor = parent.parentTaskId;
	}
}

function projectStatusTimestamps(status: ProjectStatus, now: Date) {
	if (status === "completed") {
		return { completedAt: now, cancelledAt: null };
	}
	if (status === "cancelled") {
		return { completedAt: null, cancelledAt: now };
	}
	return { completedAt: null, cancelledAt: null };
}

function milestoneStatusTimestamps(status: MilestoneStatus, now: Date) {
	if (status === "completed") {
		return { completedAt: now, cancelledAt: null };
	}
	if (status === "cancelled") {
		return { completedAt: null, cancelledAt: now };
	}
	return { completedAt: null, cancelledAt: null };
}

function taskStatusTimestamps(status: TaskStatus, now: Date) {
	if (status === "completed") {
		return { completedAt: now, cancelledAt: null };
	}
	if (status === "cancelled") {
		return { completedAt: null, cancelledAt: now };
	}
	return { completedAt: null, cancelledAt: null };
}

export async function createProject(workspaceId: string, input: ProjectInput) {
	const parsed = projectInputSchema.parse(input);
	return db.transaction(async (tx) => {
		await assertWorkspace(tx, workspaceId);
		const client = await resolveClientSnapshot(
			tx,
			workspaceId,
			parsed.clientId,
		);
		const now = new Date();
		const [created] = await tx
			.insert(projects)
			.values({
				workspaceId,
				...parsed,
				...client,
				...projectStatusTimestamps(parsed.status, now),
			})
			.returning();
		return created;
	});
}

export async function listProjects(
	workspaceId: string,
	options: { includeArchived?: boolean } = {},
) {
	const conditions = [eq(projects.workspaceId, workspaceId)];
	if (!options.includeArchived) conditions.push(isNull(projects.archivedAt));
	return db
		.select()
		.from(projects)
		.where(and(...conditions))
		.orderBy(desc(projects.createdAt));
}

export async function getProject(workspaceId: string, id: string) {
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
		.limit(1);
	return project;
}

export async function updateProject(
	workspaceId: string,
	id: string,
	input: ProjectDetailsInput,
) {
	const parsed = projectDetailsInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const current = await getProjectReference(tx, workspaceId, id);
		if (current.archivedAt) throw new Error("PROJECT_ARCHIVED");
		const client = await resolveClientSnapshot(
			tx,
			workspaceId,
			parsed.clientId,
		);
		const [updated] = await tx
			.update(projects)
			.set({ ...parsed, ...client, updatedAt: new Date() })
			.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
			.returning();
		return updated;
	});
}

export async function setProjectStatus(
	workspaceId: string,
	id: string,
	status: ProjectStatus,
) {
	return db.transaction(async (tx) => {
		const current = await getProjectReference(tx, workspaceId, id);
		if (current.archivedAt) throw new Error("PROJECT_ARCHIVED");
		if (current.status === status) throw new Error("PROJECT_STATUS_UNCHANGED");
		if (!canTransitionProject(current.status, status)) {
			throw new Error("PROJECT_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const [updated] = await tx
			.update(projects)
			.set({
				status,
				...projectStatusTimestamps(status, now),
				updatedAt: now,
			})
			.where(
				and(
					eq(projects.workspaceId, workspaceId),
					eq(projects.id, id),
					eq(projects.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("PROJECT_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function archiveProject(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const current = await getProjectReference(tx, workspaceId, id);
		if (current.archivedAt) throw new Error("PROJECT_ALREADY_ARCHIVED");
		if (current.status !== "completed" && current.status !== "cancelled") {
			throw new Error("PROJECT_MUST_BE_CLOSED");
		}
		const now = new Date();
		const [updated] = await tx
			.update(projects)
			.set({ archivedAt: now, updatedAt: now })
			.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
			.returning();
		return updated;
	});
}

export async function restoreProject(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const current = await getProjectReference(tx, workspaceId, id);
		if (!current.archivedAt) throw new Error("PROJECT_NOT_ARCHIVED");
		const [updated] = await tx
			.update(projects)
			.set({ archivedAt: null, updatedAt: new Date() })
			.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
			.returning();
		return updated;
	});
}

export async function deleteProject(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const current = await getProjectReference(tx, workspaceId, id);
		if (!current.archivedAt) throw new Error("PROJECT_MUST_BE_ARCHIVED");
		const [deleted] = await tx
			.delete(projects)
			.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
			.returning();
		return deleted;
	});
}

export async function createMilestone(
	workspaceId: string,
	input: MilestoneInput,
) {
	const parsed = milestoneInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const project = await getProjectReference(
			tx,
			workspaceId,
			parsed.projectId,
		);
		assertProjectOperational(project);
		const now = new Date();
		const [created] = await tx
			.insert(projectMilestones)
			.values({
				workspaceId,
				...parsed,
				...milestoneStatusTimestamps(parsed.status, now),
			})
			.returning();
		return created;
	});
}

export async function listProjectMilestones(
	workspaceId: string,
	projectId: string,
) {
	return db
		.select()
		.from(projectMilestones)
		.where(
			and(
				eq(projectMilestones.workspaceId, workspaceId),
				eq(projectMilestones.projectId, projectId),
			),
		)
		.orderBy(asc(projectMilestones.position), asc(projectMilestones.createdAt));
}

export async function getMilestone(workspaceId: string, id: string) {
	const [milestone] = await db
		.select()
		.from(projectMilestones)
		.where(
			and(
				eq(projectMilestones.workspaceId, workspaceId),
				eq(projectMilestones.id, id),
			),
		)
		.limit(1);
	return milestone;
}

export async function updateMilestone(
	workspaceId: string,
	id: string,
	input: MilestoneDetailsInput,
) {
	const parsed = milestoneDetailsInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const projectId = await getMilestoneProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		assertProjectOperational(project);
		const [current] = await tx
			.select({ projectId: projectMilestones.projectId })
			.from(projectMilestones)
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("MILESTONE_NOT_FOUND");
		if (current.projectId !== parsed.projectId) {
			throw new Error("MILESTONE_PROJECT_IMMUTABLE");
		}
		const [updated] = await tx
			.update(projectMilestones)
			.set({ ...parsed, updatedAt: new Date() })
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
				),
			)
			.returning();
		return updated;
	});
}

export async function setMilestoneStatus(
	workspaceId: string,
	id: string,
	status: MilestoneStatus,
) {
	return db.transaction(async (tx) => {
		const projectId = await getMilestoneProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
		if (status === "open") assertProjectOperational(project);
		const [current] = await tx
			.select({
				projectId: projectMilestones.projectId,
				status: projectMilestones.status,
			})
			.from(projectMilestones)
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("MILESTONE_NOT_FOUND");
		if (current.status === status)
			throw new Error("MILESTONE_STATUS_UNCHANGED");
		if (!canTransitionMilestone(current.status, status)) {
			throw new Error("MILESTONE_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const [updated] = await tx
			.update(projectMilestones)
			.set({
				status,
				...milestoneStatusTimestamps(status, now),
				updatedAt: now,
			})
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
					eq(projectMilestones.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("MILESTONE_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function deleteMilestone(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const projectId = await getMilestoneProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
		const [current] = await tx
			.select({ status: projectMilestones.status })
			.from(projectMilestones)
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("MILESTONE_NOT_FOUND");
		if (current.status !== "cancelled") {
			throw new Error("MILESTONE_MUST_BE_CANCELLED");
		}
		const [task] = await tx
			.select({ id: projectTasks.id })
			.from(projectTasks)
			.where(
				and(
					eq(projectTasks.workspaceId, workspaceId),
					eq(projectTasks.milestoneId, id),
				),
			)
			.limit(1);
		if (task) throw new Error("MILESTONE_HAS_TASKS");
		const [deleted] = await tx
			.delete(projectMilestones)
			.where(
				and(
					eq(projectMilestones.workspaceId, workspaceId),
					eq(projectMilestones.id, id),
				),
			)
			.returning();
		return deleted;
	});
}

export async function createTask(workspaceId: string, input: TaskInput) {
	const parsed = taskInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const project = await getProjectReference(
			tx,
			workspaceId,
			parsed.projectId,
		);
		assertProjectOperational(project);
		await assertMilestoneReference(
			tx,
			workspaceId,
			parsed.projectId,
			parsed.milestoneId,
		);
		await assertParentTaskReference(tx, workspaceId, parsed);
		const now = new Date();
		const [created] = await tx
			.insert(projectTasks)
			.values({
				workspaceId,
				...parsed,
				...taskStatusTimestamps(parsed.status, now),
			})
			.returning();
		return created;
	});
}

export async function listProjectTasks(workspaceId: string, projectId: string) {
	return db
		.select()
		.from(projectTasks)
		.where(
			and(
				eq(projectTasks.workspaceId, workspaceId),
				eq(projectTasks.projectId, projectId),
			),
		)
		.orderBy(asc(projectTasks.position), asc(projectTasks.createdAt));
}

export async function getTask(workspaceId: string, id: string) {
	const [task] = await db
		.select()
		.from(projectTasks)
		.where(
			and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
		)
		.limit(1);
	return task;
}

export async function updateTask(
	workspaceId: string,
	id: string,
	input: TaskDetailsInput,
) {
	const parsed = taskDetailsInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const projectId = await getTaskProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		assertProjectOperational(project);
		const [current] = await tx
			.select({ projectId: projectTasks.projectId })
			.from(projectTasks)
			.where(
				and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TASK_NOT_FOUND");
		if (current.projectId !== parsed.projectId) {
			throw new Error("TASK_PROJECT_IMMUTABLE");
		}
		await assertMilestoneReference(
			tx,
			workspaceId,
			parsed.projectId,
			parsed.milestoneId,
		);
		await assertParentTaskReference(tx, workspaceId, parsed, id);
		const [updated] = await tx
			.update(projectTasks)
			.set({ ...parsed, updatedAt: new Date() })
			.where(
				and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
			)
			.returning();
		return updated;
	});
}

export async function setTaskStatus(
	workspaceId: string,
	id: string,
	status: TaskStatus,
) {
	return db.transaction(async (tx) => {
		const projectId = await getTaskProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
		if (status === "todo" || status === "in_progress" || status === "blocked") {
			assertProjectOperational(project);
		}
		const [current] = await tx
			.select({
				projectId: projectTasks.projectId,
				status: projectTasks.status,
			})
			.from(projectTasks)
			.where(
				and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TASK_NOT_FOUND");
		if (current.status === status) throw new Error("TASK_STATUS_UNCHANGED");
		if (!canTransitionTask(current.status, status)) {
			throw new Error("TASK_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const [updated] = await tx
			.update(projectTasks)
			.set({
				status,
				...taskStatusTimestamps(status, now),
				updatedAt: now,
			})
			.where(
				and(
					eq(projectTasks.workspaceId, workspaceId),
					eq(projectTasks.id, id),
					eq(projectTasks.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("TASK_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function deleteTask(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const projectId = await getTaskProjectId(tx, workspaceId, id);
		const project = await getProjectReference(tx, workspaceId, projectId);
		if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
		const [current] = await tx
			.select({ status: projectTasks.status })
			.from(projectTasks)
			.where(
				and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TASK_NOT_FOUND");
		if (current.status !== "todo" && current.status !== "cancelled") {
			throw new Error("TASK_NOT_DELETABLE");
		}
		const [child] = await tx
			.select({ id: projectTasks.id })
			.from(projectTasks)
			.where(
				and(
					eq(projectTasks.workspaceId, workspaceId),
					eq(projectTasks.parentTaskId, id),
				),
			)
			.limit(1);
		if (child) throw new Error("TASK_HAS_SUBTASKS");
		const [deleted] = await tx
			.delete(projectTasks)
			.where(
				and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
			)
			.returning();
		return deleted;
	});
}
