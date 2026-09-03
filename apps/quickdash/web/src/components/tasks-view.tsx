import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { BulkDelete } from "./bulk-delete";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";

/**
 * Tasks — the individual pieces of work.
 *
 * 🔑 Grouped by project, because a task without its project is a sentence
 * without a subject. `blocked` is shown as its own state rather than folded
 * into "not done": something waiting on somebody else needs a different action
 * from something merely unstarted.
 */

const STATUSES = [
	"todo",
	"in_progress",
	"blocked",
	"completed",
	"cancelled",
] as const;

type Task = {
	id: string;
	projectId: string;
	title: string;
	status: string;
	priority: string;
	dueDate: string | null;
	estimatedMinutes: number | null;
};

type Project = { id: string; name: string };

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const readable = (value: string) => value.replace(/_/g, " ");

/** The obvious next move, so the common path is one click. */
const NEXT_STATUS: Record<string, { label: string; status: string }> = {
	todo: { label: "Start", status: "in_progress" },
	in_progress: { label: "Done", status: "completed" },
	blocked: { label: "Unblock", status: "in_progress" },
};

/** Urgent and high are worth seeing at a glance; the rest are not. */
const priorityTone = (priority: string) =>
	priority === "urgent" || priority === "high"
		? "text-[var(--signal-attention-text)]"
		: "text-[var(--ink-30)]";

export function TasksView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);

	const tasks = useQuery({
		queryKey: ["quickdash", workspaceId, "tasks"],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			const [taskPage, projectPage] = await Promise.all([
				api.request<{ items: Task[] }>("/tasks?limit=100"),
				api.request<{ items: Project[] }>("/projects?limit=100"),
			]);
			return {
				items: taskPage.data.items,
				projects: new Map(
					projectPage.data.items.map((project) => [project.id, project.name]),
				),
			};
		},
	});

	const advance = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(`/tasks/${input.id}/status`, {
				method: "POST",
				body: { status: input.status },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That change did not save." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "tasks"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				exportRows={() => tasks.data?.items ?? []}
				exportName="tasks"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search tasks"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={readable(status)}
									active={statuses.includes(status)}
									onToggle={() =>
										setStatuses(
											statuses.includes(status)
												? statuses.filter((value) => value !== status)
												: [...statuses, status],
										)
									}
								/>
							))}
						</div>
					</>
				}
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={tasks}
				loadingLabel="Loading tasks…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No tasks"
						detail="Tasks belong to a project. Create a project first, then break the work into pieces."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((task) =>
							statuses.length === 0 ? true : statuses.includes(task.status),
						)
						.filter(
							(task) => !needle || task.title.toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const projectIds = [...new Set(rows.map((task) => task.projectId))];

					return (
						<div className="space-y-5">
							{projectIds.map((projectId) => (
								<section key={projectId}>
									<p className="mb-1 text-[11px] text-[var(--ink-45)]">
										{data.projects.get(projectId) ?? "Unknown project"}
									</p>
									<PagedTable
										exportName="tasks"
										bulkActions={(chosen) => (
											<BulkDelete
												workspaceId={workspaceId}
												rows={chosen}
												path="/tasks"
												noun="tasks"
												invalidate={["quickdash", workspaceId, "tasks"]}
											/>
										)}
										workspaceId={workspaceId}
										layout={layout}
										caption="Tasks"
										rows={rows.filter((task) => task.projectId === projectId)}
										columns={[
											{
												key: "title",
												header: "Task",
												render: (task) => task.title,
											},
											{
												key: "status",
												header: "Status",
												width: "w-24",
												tight: true,
												render: (task) => (
													<span className="text-[11px] text-[var(--ink-30)] capitalize">
														{readable(task.status)}
													</span>
												),
											},
											{
												key: "priority",
												header: "Priority",
												width: "w-20",
												tight: true,
												render: (task) => (
													<span
														className={`text-[11px] capitalize ${priorityTone(
															task.priority,
														)}`}
													>
														{task.priority === "normal" ? "" : task.priority}
													</span>
												),
											},
											{
												key: "due",
												header: "Due",
												width: "w-24",
												align: "right",
												tight: true,
												render: (task) =>
													task.dueDate ? (
														<span className="text-[10.5px] text-[var(--ink-30)]">
															{new Date(task.dueDate).toLocaleDateString()}
														</span>
													) : null,
											},
											{
												key: "actions",
												header: "",
												align: "right",
												tight: true,
												render: (task) => {
													const next = NEXT_STATUS[task.status];
													return next ? (
														<button
															type="button"
															className={quiet}
															disabled={rowBusy(advance, task.id)}
															onClick={() =>
																advance.mutate({
																	id: task.id,
																	status: next.status,
																})
															}
														>
															{next.label}
														</button>
													) : null;
												},
											},
										]}
									/>
								</section>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
