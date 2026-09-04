import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import {
	EmptyState,
	PageState,
	rowActionBusy,
	rowBusy,
	WriteFailure,
} from "./page-state";

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
	"control-raised inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)] disabled:opacity-40";

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
	const { layout, setLayout } = useListLayout(workspaceId);
	// The dots come from the bell, so marking a notification read clears the row.
	const rowSignal = useRecordSignals(workspaceId);
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
				{
					method: "POST",
					// Required: this route commits through `mutationContext`, which
					// refuses a mutation carrying no `Idempotency-Key`.
					idempotencyKey: crypto.randomUUID(),
					body: { status: input.status },
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That change did not save." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "fulfillments"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => setStatuses([])}
				exportRows={() => fulfillments.data?.items ?? []}
				exportName="fulfillments"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
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
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={fulfillments}
				loadingLabel="Loading work…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing to deliver"
						detail="Work appears here when a paid order needs delivering: a parcel to pack, a file to send, an appointment to keep."
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

					/* No bulk delete, deliberately.
						    The same: this is the ORDER's state shown as a list, not a free
						    standing record that can be removed. */
					return (
						<PagedTable
							rowSignal={rowSignal}
							empty={
								<EmptyState
									title="Nothing matches"
									detail="Try a different search, or clear the status filter."
								/>
							}
							workspaceId={workspaceId}
							layout={layout}
							caption="Work to fulfil"
							rows={rows}
							columns={[
								{ key: "title", header: "Work", render: (item) => item.title },
								{
									key: "customer",
									header: "Customer",
									render: (item) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{item.clientName ?? "No customer named"}
											{item.kind ? ` · ${readable(item.kind)}` : ""}
										</span>
									),
								},
								{
									key: "status",
									header: "Status",
									width: "w-24",
									tight: true,
									render: (item) => (
										<span className="text-[12px] text-[var(--ink-60)] capitalize">
											{readable(item.status)}
										</span>
									),
								},
								{
									key: "due",
									header: "Due",
									width: "w-32",
									align: "right",
									tight: true,
									render: (item) =>
										item.dueAt ? (
											<span
												className={`text-[11px] ${
													isOverdue(item)
														? "text-[var(--signal-attention-text)]"
														: "text-[var(--ink-30)]"
												}`}
											>
												{isOverdue(item) ? "Overdue " : ""}
												{new Date(item.dueAt).toLocaleDateString()}
											</span>
										) : null,
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (item) => {
										const next = NEXT_STATUS[item.status];
										return next ? (
											<button
												type="button"
												className={quiet}
												{...rowActionBusy(rowBusy(advance, item.id))}
												onClick={() =>
													advance.mutate({ id: item.id, status: next.status })
												}
											>
												{next.label}
											</button>
										) : null;
									},
								},
							]}
						/>
					);
				}}
			</PageState>
		</main>
	);
}
