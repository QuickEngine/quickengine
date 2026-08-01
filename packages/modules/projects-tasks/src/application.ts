import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction, SortMap } from "@quickengine/db";
import {
	afterCursor,
	and,
	asc,
	db,
	decodeCursor,
	eq,
	gt,
	isNull,
	mutationUnitOfWork,
	pageOrder,
	projectMilestones,
	projects,
	projectTasks,
	resolveSort,
	toPage,
} from "@quickengine/db";
import { z } from "zod";
import {
	MILESTONE_STATUSES,
	type MilestoneDetailsInput,
	type MilestoneInput,
	type MilestoneStatus,
} from "./milestone";
import {
	PROJECT_STATUSES,
	type ProjectDetailsInput,
	type ProjectInput,
	type ProjectStatus,
} from "./project";
import {
	archiveProjectInTx,
	createMilestoneInTx,
	createProjectInTx,
	createTaskInTx,
	deleteMilestoneInTx,
	deleteProjectInTx,
	deleteTaskInTx,
	restoreProjectInTx,
	setMilestoneStatusInTx,
	setProjectStatusInTx,
	setTaskStatusInTx,
	updateMilestoneInTx,
	updateProjectInTx,
	updateTaskInTx,
} from "./records";
import {
	TASK_STATUSES,
	type TaskDetailsInput,
	type TaskInput,
	type TaskStatus,
} from "./task";

export type ProjectsMutationUnitOfWork =
	MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const PROJECT_SORTS = {
	name: projects.name,
	status: projects.status,
	createdAt: projects.createdAt,
	updatedAt: projects.updatedAt,
} as const satisfies SortMap;

export const projectListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(PROJECT_STATUSES).optional(),
	includeArchived: z.coerce.boolean().default(false),
});

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const MILESTONE_SORTS = {
	name: projectMilestones.name,
	status: projectMilestones.status,
	position: projectMilestones.position,
	createdAt: projectMilestones.createdAt,
} as const satisfies SortMap;

export const milestoneListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	projectId: z.uuid().optional(),
	status: z.enum(MILESTONE_STATUSES).optional(),
});

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const TASK_SORTS = {
	title: projectTasks.title,
	status: projectTasks.status,
	priority: projectTasks.priority,
	position: projectTasks.position,
	createdAt: projectTasks.createdAt,
} as const satisfies SortMap;

export const taskListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	milestoneId: z.uuid().optional(),
	projectId: z.uuid().optional(),
	status: z.enum(TASK_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this project was not found.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",

	PROJECT_NOT_FOUND: "The project was not found.",
	PROJECT_WORKSPACE_MISMATCH: "That project belongs to another workspace.",
	PROJECT_ARCHIVED: "This project is archived. Restore it before changing it.",
	PROJECT_ALREADY_ARCHIVED: "This project is already archived.",
	PROJECT_NOT_ARCHIVED: "This project isn't archived.",
	PROJECT_CLOSED:
		"This project is completed or cancelled and can't take new work.",
	PROJECT_STATUS_UNCHANGED: "The project is already in that status.",
	PROJECT_ILLEGAL_TRANSITION: "That project status change isn't allowed.",
	PROJECT_MUST_BE_CLOSED:
		"Complete or cancel this project before archiving it.",
	PROJECT_MUST_BE_ARCHIVED: "Archive this project before deleting it.",
	PROJECT_CONCURRENT_UPDATE:
		"The project changed while this update was in flight. Try again.",

	MILESTONE_NOT_FOUND: "The milestone was not found.",
	MILESTONE_WORKSPACE_MISMATCH: "That milestone belongs to another workspace.",
	MILESTONE_PROJECT_MISMATCH: "That milestone belongs to a different project.",
	MILESTONE_PROJECT_IMMUTABLE:
		"A milestone can't be moved to another project. Create a new one instead.",
	MILESTONE_CLOSED: "This milestone is completed or cancelled.",
	MILESTONE_STATUS_UNCHANGED: "The milestone is already in that status.",
	MILESTONE_ILLEGAL_TRANSITION: "That milestone status change isn't allowed.",
	MILESTONE_MUST_BE_CANCELLED: "Cancel this milestone before deleting it.",
	MILESTONE_HAS_TASKS:
		"This milestone still has tasks. Move or delete them first.",
	MILESTONE_CONCURRENT_UPDATE:
		"The milestone changed while this update was in flight. Try again.",

	TASK_NOT_FOUND: "The task was not found.",
	TASK_STATUS_UNCHANGED: "The task is already in that status.",
	TASK_ILLEGAL_TRANSITION: "That task status change isn't allowed.",
	TASK_NOT_DELETABLE: "This task can't be deleted from its current status.",
	TASK_HAS_SUBTASKS: "This task has subtasks. Delete or move them first.",
	TASK_PARENT_CYCLE: "A task can't be made a descendant of itself.",
	TASK_PROJECT_IMMUTABLE:
		"A task can't be moved to another project. Create a new one instead.",
	TASK_CONCURRENT_UPDATE:
		"The task changed while this update was in flight. Try again.",
	PARENT_TASK_NOT_FOUND: "The parent task was not found.",
	PARENT_TASK_WORKSPACE_MISMATCH:
		"The parent task belongs to another workspace.",
	PARENT_TASK_PROJECT_MISMATCH:
		"The parent task belongs to a different project.",
	PARENT_TASK_MILESTONE_MISMATCH:
		"The parent task belongs to a different milestone.",
};

function mapProjectsError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		// A reference pointing somewhere it shouldn't is the caller's input.
		if (/(MISMATCH|PARENT_CYCLE)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		// Everything else is the record's current state refusing the operation.
		if (
			/(ARCHIVED|CLOSED|UNCHANGED|ILLEGAL_TRANSITION|MUST_BE_|HAS_TASKS|HAS_SUBTASKS|NOT_DELETABLE|IMMUTABLE|CONCURRENT_UPDATE)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeProject = (row: typeof projects.$inferSelect) =>
	serializeDates(row);
const serializeMilestone = (row: typeof projectMilestones.$inferSelect) =>
	serializeDates(row);
const serializeTask = (row: typeof projectTasks.$inferSelect) =>
	serializeDates(row);

export type ProjectDto = ReturnType<typeof serializeProject>;
export type MilestoneDto = ReturnType<typeof serializeMilestone>;
export type TaskDto = ReturnType<typeof serializeTask>;

export async function listProjectsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		status?: string;
		includeArchived?: boolean | string;
	},
) {
	const page = projectListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(PROJECT_SORTS, page.sort, "createdAt");
	const where = and(
		eq(projects.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			projects.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.status ? eq(projects.status, page.status) : undefined,
		// Archived projects are hidden unless explicitly asked for.
		page.includeArchived ? undefined : isNull(projects.archivedAt),
	);
	const rows = await db
		.select()
		.from(projects)
		.where(where)
		.orderBy(...pageOrder(sort.column, projects.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeProject),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getProjectDto(workspaceId: string, id: string) {
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
		.limit(1);
	return project ? serializeProject(project) : null;
}

export async function listMilestonesPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		projectId?: string;
		status?: string;
	},
) {
	const page = milestoneListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(MILESTONE_SORTS, page.sort, "position");
	const where = and(
		eq(projectMilestones.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			projectMilestones.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.projectId
			? eq(projectMilestones.projectId, page.projectId)
			: undefined,
		page.status ? eq(projectMilestones.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(projectMilestones)
		.where(where)
		.orderBy(...pageOrder(sort.column, projectMilestones.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeMilestone),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getMilestoneDto(workspaceId: string, id: string) {
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
	return milestone ? serializeMilestone(milestone) : null;
}

export async function listTasksPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		milestoneId?: string;
		projectId?: string;
		status?: string;
	},
) {
	const page = taskListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(TASK_SORTS, page.sort, "position");
	const where = and(
		eq(projectTasks.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			projectTasks.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.projectId ? eq(projectTasks.projectId, page.projectId) : undefined,
		page.milestoneId
			? eq(projectTasks.milestoneId, page.milestoneId)
			: undefined,
		page.status ? eq(projectTasks.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(projectTasks)
		.where(where)
		.orderBy(...pageOrder(sort.column, projectTasks.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeTask),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getTaskDto(workspaceId: string, id: string) {
	const [task] = await db
		.select()
		.from(projectTasks)
		.where(
			and(eq(projectTasks.workspaceId, workspaceId), eq(projectTasks.id, id)),
		)
		.limit(1);
	return task ? serializeTask(task) : null;
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

export function createProjectCommand(
	context: MutationExecutionContext,
	input: ProjectInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProjectDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createProjectInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "project.created",
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.created",
				payload: { projectId: row.id },
				version: 1,
			});
			return { result: serializeProject(row), status: 201 };
		})
		.catch(mapProjectsError);
}

export function updateProjectCommand(
	context: MutationExecutionContext,
	id: string,
	input: ProjectDetailsInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProjectDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateProjectInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "project.updated",
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.updated",
				payload: { projectId: row.id },
				version: 1,
			});
			return { result: serializeProject(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function setProjectStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: ProjectStatus,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProjectDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setProjectStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "project.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.status-changed",
				payload: { projectId: row.id, status },
				version: 1,
			});
			return { result: serializeProject(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function archiveProjectCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProjectDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await archiveProjectInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "project.archived",
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.archived",
				payload: { projectId: row.id },
				version: 1,
			});
			return { result: serializeProject(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function restoreProjectCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProjectDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await restoreProjectInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "project.restored",
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.restored",
				payload: { projectId: row.id },
				version: 1,
			});
			return { result: serializeProject(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function deleteProjectCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteProjectInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "project.deleted",
				resourceId: row.id,
				resourceType: "project",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "project",
				eventName: "project.deleted",
				payload: { projectId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapProjectsError);
}

/* ── Milestones ───────────────────────────────────────────────────────────── */

export function createMilestoneCommand(
	context: MutationExecutionContext,
	input: MilestoneInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<MilestoneDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createMilestoneInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "milestone.created",
				metadata: { projectId: row.projectId },
				resourceId: row.id,
				resourceType: "milestone",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "milestone",
				eventName: "milestone.created",
				payload: { milestoneId: row.id, projectId: row.projectId },
				version: 1,
			});
			return { result: serializeMilestone(row), status: 201 };
		})
		.catch(mapProjectsError);
}

export function updateMilestoneCommand(
	context: MutationExecutionContext,
	id: string,
	input: MilestoneDetailsInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<MilestoneDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateMilestoneInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "milestone.updated",
				resourceId: row.id,
				resourceType: "milestone",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "milestone",
				eventName: "milestone.updated",
				payload: { milestoneId: row.id, projectId: row.projectId },
				version: 1,
			});
			return { result: serializeMilestone(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function setMilestoneStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: MilestoneStatus,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<MilestoneDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setMilestoneStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "milestone.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "milestone",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "milestone",
				eventName: "milestone.status-changed",
				payload: { milestoneId: row.id, projectId: row.projectId, status },
				version: 1,
			});
			return { result: serializeMilestone(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function deleteMilestoneCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteMilestoneInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "milestone.deleted",
				resourceId: row.id,
				resourceType: "milestone",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "milestone",
				eventName: "milestone.deleted",
				payload: { milestoneId: row.id, projectId: row.projectId },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapProjectsError);
}

/* ── Tasks ────────────────────────────────────────────────────────────────── */

export function createTaskCommand(
	context: MutationExecutionContext,
	input: TaskInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<TaskDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createTaskInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "task.created",
				metadata: { projectId: row.projectId },
				resourceId: row.id,
				resourceType: "task",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "task",
				eventName: "task.created",
				payload: { projectId: row.projectId, taskId: row.id },
				version: 1,
			});
			return { result: serializeTask(row), status: 201 };
		})
		.catch(mapProjectsError);
}

export function updateTaskCommand(
	context: MutationExecutionContext,
	id: string,
	input: TaskDetailsInput,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<TaskDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateTaskInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "task.updated",
				resourceId: row.id,
				resourceType: "task",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "task",
				eventName: "task.updated",
				payload: { projectId: row.projectId, taskId: row.id },
				version: 1,
			});
			return { result: serializeTask(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function setTaskStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: TaskStatus,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<TaskDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setTaskStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "task.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "task",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "task",
				eventName: "task.status-changed",
				payload: { projectId: row.projectId, status, taskId: row.id },
				version: 1,
			});
			return { result: serializeTask(row), status: 200 };
		})
		.catch(mapProjectsError);
}

export function deleteTaskCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ProjectsMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteTaskInTx(transaction.db, context.workspaceId, id);
			await transaction.audit({
				action: "task.deleted",
				resourceId: row.id,
				resourceType: "task",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "task",
				eventName: "task.deleted",
				payload: { projectId: row.projectId, taskId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapProjectsError);
}
