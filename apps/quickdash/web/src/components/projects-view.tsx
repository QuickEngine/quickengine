import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useAcknowledgeRecord, useRecordSignals } from "../lib/record-signals";
import { useSelectedRecord } from "../lib/selected-record";
import { BulkDelete } from "./bulk-delete";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { ProjectPanel } from "./module-panels";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Text as TextField } from "./product-fields";

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

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const _quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
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
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [selectedId, setSelectedId] = useSelectedRecord();
	// Opening a record accounts for whatever it was flagged for.
	useAcknowledgeRecord(workspaceId, selectedId);
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
			setCreating(false);
			setName("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add project",
		onClick: () => setCreating((open) => !open),
	});

	const _archive = useMutation({
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
			{creating ? (
				<CreatePanel
					title="New project"
					submitLabel="Create project"
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="K2 launch"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				exportRows={() => projects.data?.items ?? []}
				exportName="projects"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
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

			{failure ? <WriteFailure message={failure} /> : null}

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
						<PagedTable
							exportName="projects"
							bulkActions={(chosen) => (
								<BulkDelete
									workspaceId={workspaceId}
									rows={chosen}
									path="/projects"
									noun="projects"
									invalidate={["quickdash", workspaceId, "projects"]}
								/>
							)}
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Projects"
							rows={rows}
							selectedId={selectedId}
							onOpen={(project) => setSelectedId(project.id)}
							columns={[
								{
									key: "name",
									header: "Project",
									render: (project) => project.name,
								},
								{
									key: "description",
									header: "Description",
									render: (project) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{project.description ?? ""}
										</span>
									),
								},
								{
									key: "status",
									header: "Status",
									width: "w-24",
									tight: true,
									render: (project) => (
										<span className="text-[11px] text-[var(--ink-30)] capitalize">
											{readable(project.status)}
										</span>
									),
								},
								{
									key: "due",
									header: "Due",
									width: "w-32",
									align: "right",
									tight: true,
									render: (project) =>
										project.dueDate ? (
											<span
												className={`text-[11px] ${
													isOverdue(project)
														? "text-[var(--signal-attention)]"
														: "text-[var(--ink-30)]"
												}`}
											>
												{isOverdue(project) ? "Overdue " : ""}
												{new Date(project.dueDate).toLocaleDateString()}
											</span>
										) : null,
								},
							]}
						/>
					);
				}}
			</PageState>
			{selectedId ? (
				<ProjectPanel
					workspaceId={workspaceId}
					id={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
