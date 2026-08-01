import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	archiveProjectCommand,
	createMilestoneCommand,
	createProjectCommand,
	createTaskCommand,
	deleteMilestoneCommand,
	deleteProjectCommand,
	deleteTaskCommand,
	getMilestoneDto,
	getProjectDto,
	getTaskDto,
	listMilestonesPage,
	listProjectsPage,
	listTasksPage,
	MILESTONE_STATUSES,
	PROJECT_STATUSES,
	restoreProjectCommand,
	setMilestoneStatusCommand,
	setProjectStatusCommand,
	setTaskStatusCommand,
	TASK_STATUSES,
	updateMilestoneCommand,
	updateProjectCommand,
	updateTaskCommand,
} from "@quickengine/mod-projects-tasks";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();
const projectStatusSchema = z.object({ status: z.enum(PROJECT_STATUSES) });
const milestoneStatusSchema = z.object({ status: z.enum(MILESTONE_STATUSES) });
const taskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });

export function registerProjectsRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "projects:read",
		module: "projects-tasks",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "projects:write",
		module: "projects-tasks",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "projects.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "projects.write",
	});

	const mutationContext = async (
		c: Context<PlatformEnv>,
		operation: string,
		canonicalInput: unknown,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation,
			requestId: c.get("requestId"),
		});

	/* Projects */

	app.get("/v1/projects", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listProjectsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				includeArchived: c.req.query("includeArchived"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/projects", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "projects.create", body);
		return respondMutation(
			c,
			await createProjectCommand(context, body, options.uow),
		);
	});
	app.get("/v1/projects/:id", readAccess, readLimit, async (c) => {
		const project = await getProjectDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return project
			? respond(c, project)
			: respondError(c, "NOT_FOUND", "The project was not found.", 404);
	});
	app.patch("/v1/projects/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "projects.update", { body, id });
		return respondMutation(
			c,
			await updateProjectCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/projects/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = projectStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "projects.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setProjectStatusCommand(context, id, status, options.uow),
		);
	});
	app.post("/v1/projects/:id/archive", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "projects.archive", { id });
		return respondMutation(
			c,
			await archiveProjectCommand(context, id, options.uow),
		);
	});
	app.post("/v1/projects/:id/restore", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "projects.restore", { id });
		return respondMutation(
			c,
			await restoreProjectCommand(context, id, options.uow),
		);
	});
	app.delete("/v1/projects/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "projects.delete", { id });
		return respondMutation(
			c,
			await deleteProjectCommand(context, id, options.uow),
		);
	});

	/* Milestones */

	app.get("/v1/milestones", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listMilestonesPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				projectId: c.req.query("projectId"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/milestones", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "milestones.create", body);
		return respondMutation(
			c,
			await createMilestoneCommand(context, body, options.uow),
		);
	});
	app.get("/v1/milestones/:id", readAccess, readLimit, async (c) => {
		const milestone = await getMilestoneDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return milestone
			? respond(c, milestone)
			: respondError(c, "NOT_FOUND", "The milestone was not found.", 404);
	});
	app.patch("/v1/milestones/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "milestones.update", { body, id });
		return respondMutation(
			c,
			await updateMilestoneCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/milestones/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = milestoneStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "milestones.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setMilestoneStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/milestones/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "milestones.delete", { id });
		return respondMutation(
			c,
			await deleteMilestoneCommand(context, id, options.uow),
		);
	});

	/* Tasks */

	app.get("/v1/tasks", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listTasksPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				milestoneId: c.req.query("milestoneId"),
				projectId: c.req.query("projectId"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/tasks", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "tasks.create", body);
		return respondMutation(
			c,
			await createTaskCommand(context, body, options.uow),
		);
	});
	app.get("/v1/tasks/:id", readAccess, readLimit, async (c) => {
		const task = await getTaskDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return task
			? respond(c, task)
			: respondError(c, "NOT_FOUND", "The task was not found.", 404);
	});
	app.patch("/v1/tasks/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "tasks.update", { body, id });
		return respondMutation(
			c,
			await updateTaskCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/tasks/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = taskStatusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "tasks.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setTaskStatusCommand(context, id, status, options.uow),
		);
	});
	app.delete("/v1/tasks/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "tasks.delete", { id });
		return respondMutation(
			c,
			await deleteTaskCommand(context, id, options.uow),
		);
	});
}
