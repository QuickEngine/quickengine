import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const project = {
	id: "00000000-0000-4000-8000-0000000016a1",
	workspaceId: "workspace_123",
	name: "Website rebuild",
	status: "active" as const,
	clientId: null,
	description: null,
	startDate: null,
	dueDate: null,
	archivedAt: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = project) => {
	// A Response body can only be read once, so each call gets a fresh one — these tests
	// deliberately make more than one request per case.
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(
			async () =>
				new Response(JSON.stringify({ data: payload }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("projects resource", () => {
	it("hides archived projects unless asked", async () => {
		const { quick, fetcher } = server({
			items: [project],
			page: { hasMore: false, nextCursor: null },
		});

		await quick.projects.list({ status: "active" });
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/projects?status=active",
		);

		await quick.projects.list({ includeArchived: true });
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://api.quickengine.test/v1/projects?includeArchived=true",
		);
	});

	it("archives and restores over their own routes", async () => {
		const { quick, fetcher } = server();
		await quick.projects.archive(project.id, "prj-archive-1");
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/projects/${project.id}/archive`,
		);

		await quick.projects.restore(project.id, "prj-restore-1");
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			`https://api.quickengine.test/v1/projects/${project.id}/restore`,
		);
		expect(
			new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
		).toBe("prj-restore-1");
	});

	it("scopes milestones to a project", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.projects.milestones.list({ projectId: project.id });
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/milestones?projectId=${project.id}`,
		);
	});

	it("creates a subtask under a parent", async () => {
		const { quick, fetcher } = server();
		await quick.projects.tasks.create(
			{
				projectId: project.id,
				parentTaskId: "00000000-0000-4000-8000-0000000016d1",
				title: "Child",
			},
			"tsk-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/tasks");
		expect(JSON.parse(String(init?.body))).toMatchObject({
			parentTaskId: "00000000-0000-4000-8000-0000000016d1",
		});
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"tsk-create-1",
		);
	});

	it("filters tasks by milestone", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.projects.tasks.list({
			milestoneId: "00000000-0000-4000-8000-0000000016c1",
			status: "todo",
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/tasks?milestoneId=00000000-0000-4000-8000-0000000016c1&status=todo",
		);
	});
});
