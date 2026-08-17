import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Fulfillment — the work of actually delivering what was bought.
 *
 * 🔑 Deliberately wider than shipping. A parcel is one way to deliver something;
 * a download, an appointment and a collection are others, and a business that
 * sells any of those still has work to track. `kind` is what distinguishes
 * them, and the page shows it rather than assuming everything goes in a box.
 *
 * ⚠️ A fulfillment is opened FROM an order once it is paid, so nothing is
 * created here. Making one by hand would produce work with no sale behind it.
 */

const STATUSES = [
	"pending",
	"in_progress",
	"fulfilled",
	"failed",
	"cancelled",
] as const;

type Fulfillment = {
	id: string;
	title: string;
	kind: string;
	status: string;
	clientName: string | null;
	instructions: string | null;
	dueAt: string | null;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** The one obvious next step, so the common path is a click not a menu. */
const NEXT_STATUS: Record<string, { label: string; status: string }> = {
	pending: { label: "Start", status: "in_progress" },
	in_progress: { label: "Mark done", status: "fulfilled" },
};

const readable = (value: string) => value.replace(/_/g, " ");

/** Overdue is worth shouting about; a due date on its own is not. */
const isOverdue = (fulfillment: Fulfillment) =>
	Boolean(
		fulfillment.dueAt &&
			new Date(fulfillment.dueAt).getTime() < Date.now() &&
			fulfillment.status !== "fulfilled" &&
			fulfillment.status !== "cancelled",
	);

export function FulfillmentView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const fulfillments = useQuery({
		queryKey: ["quickdash", workspaceId, "fulfillments"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Fulfillment[] }>(
					"/fulfillments?limit=100",
				)
			).data,
	});

	const advance = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(
				`/fulfillments/${input.id}/status`,
				{ method: "POST", body: { status: input.status } },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "fulfillments"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search work by title or customer"
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
				query={fulfillments}
				loadingLabel="Loading work…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing to deliver"
						detail="Work appears here when a paid order needs delivering — a parcel to pack, a file to send, an appointment to keep."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((item) =>
							statuses.length === 0 ? true : statuses.includes(item.status),
						)
						.filter(
							(item) =>
								!needle ||
								item.title.toLowerCase().includes(needle) ||
								(item.clientName ?? "").toLowerCase().includes(needle),
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
							{rows.map((item) => {
								const next = NEXT_STATUS[item.status];
								const overdue = isOverdue(item);
								return (
									<div key={item.id} className="flex items-center gap-3 py-2.5">
										<span className="w-24 shrink-0 text-[12px] text-[var(--ink-60)] capitalize">
											{readable(item.status)}
										</span>
										<div className="min-w-0 flex-1">
											<p className="truncate text-[12.5px] text-[var(--ink-85)]">
												{item.title}
											</p>
											<p className="truncate text-[11px] text-[var(--ink-30)]">
												{item.clientName ?? "No customer named"}
												{item.kind ? ` · ${readable(item.kind)}` : ""}
											</p>
										</div>

										{item.dueAt ? (
											<span
												className={`shrink-0 text-[11px] ${
													overdue ? "text-[#f5b44a]" : "text-[var(--ink-30)]"
												}`}
											>
												{overdue ? "Overdue " : "Due "}
												{new Date(item.dueAt).toLocaleDateString()}
											</span>
										) : null}

										{next ? (
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(advance, item.id)}
												onClick={() =>
													advance.mutate({ id: item.id, status: next.status })
												}
											>
												{next.label}
											</button>
										) : null}
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
