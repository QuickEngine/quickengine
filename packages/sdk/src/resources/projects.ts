import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickMilestone,
	QuickMilestoneInput,
	QuickMilestoneStatus,
	QuickProject,
	QuickProjectInput,
	QuickProjectStatus,
	QuickResponse,
	QuickTask,
	QuickTaskInput,
	QuickTaskStatus,
} from "../types";

/**
 * Typed client for a workspace's delivery work. Reached as `quick.projects`, with milestones and
 * tasks hanging off the same resource because they only exist inside a project.
 *
 * The lifecycle is deliberate: a project must be completed or cancelled before it can be
 * archived, and archived before it can be deleted, so finished work is never silently destroyed.
 */
export class ProjectsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			status?: QuickProjectStatus;
			/** Archived projects are hidden unless this is set. */
			includeArchived?: boolean;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickProject>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.status) query.set("status", options.status);
		if (options.includeArchived) query.set("includeArchived", "true");
		return this.client.request(`/projects${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickProject>(
			`/projects/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickProjectInput, idempotencyKey: string) {
		return this.client.request<QuickProject>("/projects", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickProjectInput, idempotencyKey: string) {
		return this.client.request<QuickProject>(
			`/projects/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(id: string, status: QuickProjectStatus, idempotencyKey: string) {
		return this.client.request<QuickProject>(
			`/projects/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	/** Only a completed or cancelled project can be archived. */
	archive(id: string, idempotencyKey: string) {
		return this.client.request<QuickProject>(
			`/projects/${encodeURIComponent(id)}/archive`,
			{ method: "POST", idempotencyKey },
		);
	}
	restore(id: string, idempotencyKey: string) {
		return this.client.request<QuickProject>(
			`/projects/${encodeURIComponent(id)}/restore`,
			{ method: "POST", idempotencyKey },
		);
	}
	/** Only an archived project can be deleted. */
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/projects/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	readonly milestones = {
		list: (
			options: {
				cursor?: string;
				limit?: number;
				projectId?: string;
				status?: QuickMilestoneStatus;
			} = {},
		): Promise<QuickResponse<QuickCursorPage<QuickMilestone>>> => {
			const query = new URLSearchParams();
			if (options.cursor) query.set("cursor", options.cursor);
			if (options.limit) query.set("limit", String(options.limit));
			if (options.projectId) query.set("projectId", options.projectId);
			if (options.status) query.set("status", options.status);
			return this.client.request(`/milestones${query.size ? `?${query}` : ""}`);
		},
		get: (id: string) =>
			this.client.request<QuickMilestone>(
				`/milestones/${encodeURIComponent(id)}`,
			),
		create: (input: QuickMilestoneInput, idempotencyKey: string) =>
			this.client.request<QuickMilestone>("/milestones", {
				method: "POST",
				body: input,
				idempotencyKey,
			}),
		update: (id: string, patch: QuickMilestoneInput, idempotencyKey: string) =>
			this.client.request<QuickMilestone>(
				`/milestones/${encodeURIComponent(id)}`,
				{ method: "PATCH", body: patch, idempotencyKey },
			),
		setStatus: (
			id: string,
			status: QuickMilestoneStatus,
			idempotencyKey: string,
		) =>
			this.client.request<QuickMilestone>(
				`/milestones/${encodeURIComponent(id)}/status`,
				{ method: "POST", body: { status }, idempotencyKey },
			),
		/** Must be cancelled first, and must hold no tasks. */
		delete: (id: string, idempotencyKey: string) =>
			this.client.request<{ id: string }>(
				`/milestones/${encodeURIComponent(id)}`,
				{ method: "DELETE", idempotencyKey },
			),
	};

	readonly tasks = {
		list: (
			options: {
				cursor?: string;
				limit?: number;
				milestoneId?: string;
				projectId?: string;
				status?: QuickTaskStatus;
			} = {},
		): Promise<QuickResponse<QuickCursorPage<QuickTask>>> => {
			const query = new URLSearchParams();
			if (options.cursor) query.set("cursor", options.cursor);
			if (options.limit) query.set("limit", String(options.limit));
			if (options.milestoneId) query.set("milestoneId", options.milestoneId);
			if (options.projectId) query.set("projectId", options.projectId);
			if (options.status) query.set("status", options.status);
			return this.client.request(`/tasks${query.size ? `?${query}` : ""}`);
		},
		get: (id: string) =>
			this.client.request<QuickTask>(`/tasks/${encodeURIComponent(id)}`),
		create: (input: QuickTaskInput, idempotencyKey: string) =>
			this.client.request<QuickTask>("/tasks", {
				method: "POST",
				body: input,
				idempotencyKey,
			}),
		/** Re-parenting is allowed, but never in a way that would make a task its own ancestor. */
		update: (id: string, patch: QuickTaskInput, idempotencyKey: string) =>
			this.client.request<QuickTask>(`/tasks/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: patch,
				idempotencyKey,
			}),
		setStatus: (id: string, status: QuickTaskStatus, idempotencyKey: string) =>
			this.client.request<QuickTask>(
				`/tasks/${encodeURIComponent(id)}/status`,
				{ method: "POST", body: { status }, idempotencyKey },
			),
		/** A task with subtasks can't be deleted until they are moved or removed. */
		delete: (id: string, idempotencyKey: string) =>
			this.client.request<{ id: string }>(`/tasks/${encodeURIComponent(id)}`, {
				method: "DELETE",
				idempotencyKey,
			}),
	};
}
