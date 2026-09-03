import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { BulkDelete } from "./bulk-delete";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";

/**
 * Time — hours worked, and whether they can still be billed.
 *
 * 🔴 `invoiced` is terminal and must look it. Once time has been billed to a
 * customer, editing or voiding it would put the ledger and the invoice out of
 * step — so those entries offer no actions at all rather than an action that
 * fails.
 *
 * 🔑 A running timer is shown first and separately. It is the only row that is
 * still changing, and burying it in a date-sorted list is how somebody leaves
 * one running overnight.
 */

const STATUSES = ["running", "draft", "approved", "invoiced", "void"] as const;

type TimeEntry = {
	id: string;
	projectId: string;
	taskId: string | null;
	status: string;
	description: string | null;
	billable: boolean;
	durationSeconds: number;
	startedAt?: string | null;
	createdAt: string;
};

type Project = { id: string; name: string };

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** Hours and minutes, because nobody reads seconds off a timesheet. */
const duration = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.round((seconds % 3600) / 60);
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export function TimeView({ workspaceId }: { workspaceId: string }) {
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

	const entries = useQuery({
		queryKey: ["quickdash", workspaceId, "time-entries"],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			const [entryPage, projectPage] = await Promise.all([
				api.request<{ items: TimeEntry[] }>("/time-entries?limit=100"),
				api.request<{ items: Project[] }>("/projects?limit=100"),
			]);
			return {
				items: entryPage.data.items,
				projects: new Map(
					projectPage.data.items.map((project) => [project.id, project.name]),
				),
			};
		},
		// While something is running the number on screen is already stale. Cheap
		// to refresh, and a stopwatch that does not move reads as broken.
		refetchInterval: (query) =>
			(query.state.data?.items ?? []).some(
				(entry) => entry.status === "running",
			)
				? 30_000
				: false,
	});

	const stop = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/timers/${id}/stop`, {
				method: "POST",
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That timer did not stop." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "time-entries"],
			}),
	});

	const voidEntry = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/time-entries/${id}/void`, {
				method: "POST",
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That entry could not be voided." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "time-entries"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => setStatuses([])}
				exportRows={() => entries.data?.items ?? []}
				exportName="time-entries"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search time by description"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={status}
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
				query={entries}
				loadingLabel="Loading time…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No time recorded"
						detail="Time logged against a project appears here, ready to approve and bill."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((entry) =>
							statuses.length === 0 ? true : statuses.includes(entry.status),
						)
						.filter(
							(entry) =>
								!needle ||
								(entry.description ?? "").toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const running = rows.filter((entry) => entry.status === "running");
					const rest = rows.filter((entry) => entry.status !== "running");
					const _billable = rest
						.filter((entry) => entry.billable && entry.status !== "void")
						.reduce((total, entry) => total + entry.durationSeconds, 0);

					const columns = [
						{
							key: "description",
							header: "Work",
							render: (entry: TimeEntry) =>
								entry.description ?? "No description",
						},
						{
							key: "project",
							header: "Project",
							render: (entry: TimeEntry) => (
								<span className="text-[11px] text-[var(--ink-30)]">
									{data.projects.get(entry.projectId) ?? "Unknown project"}
								</span>
							),
						},
						{
							key: "duration",
							header: "Time",
							width: "w-20",
							align: "right" as const,
							tight: true,
							render: (entry: TimeEntry) => duration(entry.durationSeconds),
						},
						{
							key: "status",
							header: "Status",
							width: "w-20",
							tight: true,
							render: (entry: TimeEntry) => (
								<span className="text-[11px] text-[var(--ink-30)] capitalize">
									{entry.status}
								</span>
							),
						},
						{
							key: "billable",
							header: "Billable",
							width: "w-24",
							tight: true,
							render: (entry: TimeEntry) => (
								<span className="text-[11px] text-[var(--ink-30)]">
									{entry.billable ? "Billable" : "Not billable"}
								</span>
							),
						},
						{
							key: "actions",
							header: "",
							align: "right" as const,
							tight: true,
							render: (entry: TimeEntry) =>
								entry.status === "running" ? (
									<button
										type="button"
										className={quiet}
										disabled={stop.isPending}
										onClick={() => stop.mutate(entry.id)}
									>
										Stop
									</button>
								) : entry.status === "draft" || entry.status === "approved" ? (
									<button
										type="button"
										className={quiet}
										disabled={voidEntry.isPending}
										onClick={() => voidEntry.mutate(entry.id)}
									>
										Void
									</button>
								) : null,
						},
					];

					return (
						<>
							{running.length > 0 ? (
								<section className="mb-5">
									<p className="mb-1 flex items-center gap-2 text-[11px] text-[var(--ink-45)]">
										<span className="size-1.5 animate-pulse rounded-full bg-[var(--signal-attention)]" />
										Running now
									</p>
									<PagedTable
										exportName="entries"
										bulkActions={(chosen) => (
											<BulkDelete
												workspaceId={workspaceId}
												rows={chosen}
												path="/time-entries"
												noun="entries"
												invalidate={["quickdash", workspaceId, "time-entries"]}
											/>
										)}
										workspaceId={workspaceId}
										layout={layout}
										caption="Timers running"
										rows={running}
										columns={columns}
									/>
								</section>
							) : null}

							<PagedTable
								workspaceId={workspaceId}
								layout={layout}
								caption="Time entries"
								rows={rest}
								columns={columns}
							/>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
