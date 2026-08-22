import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { ShipmentPanel } from "./module-panels";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";

/**
 * Shipments — what has actually left the building.
 *
 * 🔑 Separate from an order's status on purpose. An order can be paid and
 * confirmed with nothing shipped; a parcel can be in transit while the order is
 * still open. Collapsing the two is how a customer gets told their thing is on
 * the way before anybody has packed it.
 */

const STATUSES = [
	"draft",
	"ready",
	"shipped",
	"in_transit",
	"delivered",
	"exception",
	"cancelled",
] as const;

type Shipment = {
	id: string;
	orderId: string | null;
	status: string;
	carrier: string | null;
	serviceLevel: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	createdAt: string;
	shippedAt: string | null;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** What comes next, so the common action is one click rather than a menu. */
const NEXT_STATUS: Record<string, { label: string; status: string }> = {
	draft: { label: "Mark ready", status: "ready" },
	ready: { label: "Mark shipped", status: "shipped" },
	shipped: { label: "Mark in transit", status: "in_transit" },
	in_transit: { label: "Mark delivered", status: "delivered" },
};

const readable = (status: string) => status.replace(/_/g, " ");

export function ShipmentsView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const shipments = useQuery({
		queryKey: ["quickdash", workspaceId, "shipments"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Shipment[] }>(
					"/shipments?limit=100",
				)
			).data,
	});

	const advance = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(`/shipments/${input.id}/status`, {
				method: "POST",
				// Required: this route commits through `mutationContext`, which
				// refuses a mutation carrying no `Idempotency-Key`.
				idempotencyKey: crypto.randomUUID(),
				body: { status: input.status },
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "shipments"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by tracking number or carrier"
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
				query={shipments}
				loadingLabel="Loading shipments…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing shipped yet"
						detail="A shipment is created from an order once you are ready to send it. Its delivery address is filled in from the order."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((shipment) =>
							statuses.length === 0 ? true : statuses.includes(shipment.status),
						)
						.filter(
							(shipment) =>
								!needle ||
								(shipment.trackingNumber ?? "")
									.toLowerCase()
									.includes(needle) ||
								(shipment.carrier ?? "").toLowerCase().includes(needle),
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
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Shipments"
							rows={rows}
							selectedId={selectedId}
							onOpen={(shipment) => setSelectedId(shipment.id)}
							columns={[
								{
									key: "carrier",
									header: "Carrier",
									render: (shipment) =>
										`${shipment.carrier ?? "No carrier set"}${
											shipment.serviceLevel ? ` · ${shipment.serviceLevel}` : ""
										}`,
								},
								{
									key: "tracking",
									header: "Tracking",
									width: "w-56",
									render: (shipment) =>
										shipment.trackingNumber ? (
											// Linked when the carrier gave a url, because copying a
											// tracking number into a search engine is a chore
											// somebody does several times a day.
											shipment.trackingUrl ? (
												<a
													href={shipment.trackingUrl}
													target="_blank"
													rel="noreferrer"
													className="font-mono text-[10.5px] text-[var(--ink-45)] underline underline-offset-2"
												>
													{shipment.trackingNumber}
												</a>
											) : (
												<span className="font-mono text-[10.5px] text-[var(--ink-30)]">
													{shipment.trackingNumber}
												</span>
											)
										) : (
											<span className="text-[10.5px] text-[var(--ink-30)]">
												No tracking number
											</span>
										),
								},
								{
									key: "status",
									header: "Status",
									width: "w-28",
									tight: true,
									render: (shipment) => (
										<span className="text-[12px] text-[var(--ink-60)] capitalize">
											{readable(shipment.status)}
										</span>
									),
								},
								{
									key: "created",
									header: "Created",
									width: "w-24",
									align: "right",
									tight: true,
									render: (shipment) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(shipment.createdAt).toLocaleDateString()}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (shipment) => {
										const next = NEXT_STATUS[shipment.status];
										return next ? (
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(advance, shipment.id)}
												onClick={() =>
													advance.mutate({
														id: shipment.id,
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
					);
				}}
			</PageState>
			{selectedId ? (
				<ShipmentPanel
					workspaceId={workspaceId}
					id={selectedId}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
