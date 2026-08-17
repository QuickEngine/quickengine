import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

/**
 * Projects — work with a beginning and an end.
 *
 * ⚠️ Archiving is not deleting, and the list hides archived projects by default
 * rather than dropping them. A finished project still holds its tasks, its time
 * and what it was billed for, so removing it would take the history with it.
 */

const STATUSES = [
	"draft",
	"active",
	"on_hold",
	"completed",
	"cancelled",
] as const;

type Project = {
	id: string;
	name: string;
	status: string;
	clientId: string | null;
	description: string | null;
	startDate: string | null;
	dueDate: string | null;
	archivedAt: string | null;
};

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

const readable = (value: string) => value.replace(/_/g, " ");

const isOverdue = (project: Project) =>
	Boolean(
		project.dueDate &&
			new Date(project.dueDate).getTime() < Date.now() &&
			project.status !== "completed" &&
			project.status !== "cancelled",
	);

export function ProjectsView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [name, setName] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const projects = useQuery({
		queryKey: ["quickdash", workspaceId, "projects"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Project[] }>(
					"/projects?limit=100",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "projects"],
		});

	const create = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request("/projects", {
				method: "POST",
				body: { name: name.trim(), status: "active" },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That project could not be created."),
		onSuccess: () => {
			setName("");
			refresh();
		},
	});

	const archive = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/projects/${id}/archive`, {
				method: "POST",
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be archived."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				className="mb-4 flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) create.mutate();
				}}
			>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="New project name"
					className={`${field} w-72`}
				/>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !name.trim()}
				>
					{create.isPending ? "Creating…" : "Create project"}
				</button>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search projects"
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
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={projects}
				loadingLabel="Loading projects…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No projects"
						detail="A project groups tasks, time and what gets billed for a piece of work."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((project) =>
							statuses.length === 0 ? true : statuses.includes(project.status),
						)
						.filter(
							(project) =>
								!needle || project.name.toLowerCase().includes(needle),
						);
					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}
					return (
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{rows.map((project) => {
								const late = isOverdue(project);
								return (
									<div
										key={project.id}
										className="flex items-center gap-3 py-2.5"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-[12.5px] text-[var(--ink-85)]">
												{project.name}
											</p>
											{project.description ? (
												<p className="truncate text-[11px] text-[var(--ink-30)]">
													{project.description}
												</p>
											) : null}
										</div>
										<span className="w-24 shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
											{readable(project.status)}
										</span>
										{project.dueDate ? (
											<span
												className={`w-32 shrink-0 text-right text-[11px] ${
													late ? "text-[#f5b44a]" : "text-[var(--ink-30)]"
												}`}
											>
												{late ? "Overdue " : "Due "}
												{new Date(project.dueDate).toLocaleDateString()}
											</span>
										) : (
											<span className="w-32 shrink-0" />
										)}
										<button
											type="button"
											className={quiet}
											disabled={archive.isPending}
											onClick={() => archive.mutate(project.id)}
										>
											Archive
										</button>
									</div>
								);
							})}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
