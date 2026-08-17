import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

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
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

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
			setFailure(error?.message ?? "That timer did not stop."),
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
			setFailure(error?.message ?? "That entry could not be voided."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "time-entries"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
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
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
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
					const billable = rest
						.filter((entry) => entry.billable && entry.status !== "void")
						.reduce((total, entry) => total + entry.durationSeconds, 0);

					const row = (entry: TimeEntry) => (
						<div key={entry.id} className="flex items-center gap-3 py-2.5">
							<span className="w-20 shrink-0 text-[12.5px] text-[var(--ink-85)]">
								{duration(entry.durationSeconds)}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12px] text-[var(--ink-85)]">
									{entry.description ?? "No description"}
								</p>
								<p className="truncate text-[11px] text-[var(--ink-30)]">
									{data.projects.get(entry.projectId) ?? "Unknown project"}
								</p>
							</div>
							<span className="w-20 shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
								{entry.status}
							</span>
							<span className="w-20 shrink-0 text-[11px] text-[var(--ink-30)]">
								{entry.billable ? "Billable" : "Not billable"}
							</span>
							{entry.status === "running" ? (
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
							) : (
								// Invoiced or already void: nothing to offer, and an action
								// that would be refused is worse than no action.
								<span className="w-14 shrink-0" />
							)}
						</div>
					);

					return (
						<>
							{running.length > 0 ? (
								<section className="mb-5">
									<p className="mb-1 flex items-center gap-2 text-[11px] text-[var(--ink-45)]">
										<span className="size-1.5 animate-pulse rounded-full bg-[#f5b44a]" />
										Running now
									</p>
									<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
										{running.map(row)}
									</div>
								</section>
							) : null}

							{billable > 0 ? (
								<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
									{duration(billable)} billable and not yet invoiced.
								</p>
							) : null}

							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{rest.map(row)}
							</div>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
