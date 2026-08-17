import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { InventoryPanel } from "./inventory-panel";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";

/**
 * Stock levels — what is actually on the shelf.
 *
 * 🔴 On hand and RESERVED are different numbers and both matter. Checkout
 * reserves stock before an order is paid, so an item can show three on hand
 * with three reserved and be genuinely unsellable. A page showing only "3"
 * would have somebody promise stock that is already spoken for.
 */

type InventoryItem = {
	id: string;
	catalogItemId: string;
	catalogItemVariantId: string | null;
	status: string;
	onHand: number;
	reserved: number;
	lowStockThreshold: number;
};

type CatalogItem = { id: string; name: string };

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
	"h-8 w-20 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[12px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)]";

/**
 * What a person can actually sell right now.
 *
 * 🔑 On hand minus reserved. This is the number that answers "can I take
 * another order", and it is not stored — deriving it here keeps it honest
 * against whichever of the two moved.
 */
const available = (item: InventoryItem) => item.onHand - item.reserved;

export function InventoryView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals();
	const queryClient = useQueryClient();
	// The panel needs the product NAME, which the inventory row does not carry.
	const [selected, setSelected] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [search, setSearch] = useState("");
	const [lowOnly, setLowOnly] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	const inventory = useQuery({
		queryKey: ["quickdash", workspaceId, "inventory"],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			// The catalog comes along so rows can be named. An inventory row knows
			// only a catalog item id, and a screen of uuids is unreadable.
			const [levels, catalog] = await Promise.all([
				api.request<{ items: InventoryItem[] }>("/inventory?limit=100"),
				api.catalog.list({ limit: 100 }),
			]);
			return {
				items: levels.data.items,
				names: new Map(
					(catalog.data.items as CatalogItem[]).map((item) => [
						item.id,
						item.name,
					]),
				),
			};
		},
	});

	const adjust = useMutation({
		mutationFn: async (input: {
			id: string;
			kind: "receive" | "correction_out";
			quantity: number;
		}) => {
			await workspaceApi(workspaceId).inventory.adjust(
				input.id,
				{ kind: input.kind, quantity: input.quantity },
				crypto.randomUUID(),
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That adjustment did not save."),
		onSuccess: (_result, input) => {
			setDrafts((current) => ({ ...current, [input.id]: "" }));
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "inventory"],
			});
		},
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search stock by product"
				filterCount={lowOnly ? 1 : 0}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Show</p>
						<FilterChip
							label="Low or out of stock"
							active={lowOnly}
							onToggle={() => setLowOnly(!lowOnly)}
						/>
					</>
				}
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={inventory}
				loadingLabel="Loading stock…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing tracked yet"
						detail="Stock appears here once a product is set up to be counted. Products sold without tracking never run out."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((item) =>
							lowOnly ? available(item) <= item.lowStockThreshold : true,
						)
						.filter((item) => {
							if (!needle) return true;
							const name = data.names.get(item.catalogItemId) ?? "";
							return name.toLowerCase().includes(needle);
						});

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail={
									lowOnly
										? "Nothing is low on stock. Clear the filter to see everything."
										: "Try a different search."
								}
							/>
						);
					}

					return (
						<PagedTable
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Stock levels"
							rows={rows}
							selectedId={selected?.id ?? null}
							onOpen={(item) =>
								setSelected({
									id: item.id,
									name: data.names.get(item.catalogItemId) ?? "Unnamed product",
								})
							}
							columns={[
								{
									key: "product",
									header: "Product",
									render: (item) => (
										<>
											{data.names.get(item.catalogItemId) ?? "Unnamed product"}
											{item.catalogItemVariantId ? (
												<span className="ml-2 text-[11px] text-[var(--ink-30)]">
													variant
												</span>
											) : null}
										</>
									),
								},
								{
									key: "sellable",
									header: "Sellable",
									width: "w-24",
									align: "right",
									tight: true,
									render: (item) => (
										<span
											className={
												available(item) <= item.lowStockThreshold
													? "text-[var(--signal-attention)]"
													: "text-[var(--ink-85)]"
											}
										>
											{available(item)}
										</span>
									),
								},
								{
									key: "onHand",
									header: "On hand",
									width: "w-24",
									align: "right",
									tight: true,
									render: (item) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{item.onHand}
										</span>
									),
								},
								{
									key: "reserved",
									header: "Reserved",
									width: "w-24",
									align: "right",
									tight: true,
									// Blank rather than "0": a zero on every row hides the rows
									// where it matters.
									render: (item) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{item.reserved > 0 ? item.reserved : ""}
										</span>
									),
								},
								{
									key: "adjust",
									header: "Adjust",
									align: "right",
									tight: true,
									render: (item) => {
										const draft = drafts[item.id] ?? "";
										const amount = Number(draft);
										const canAdjust = Number.isFinite(amount) && amount > 0;
										return (
											<div className="flex items-center justify-end gap-1.5">
												<input
													value={draft}
													onChange={(event) =>
														setDrafts((current) => ({
															...current,
															[item.id]: event.target.value,
														}))
													}
													placeholder="Qty"
													inputMode="numeric"
													className={field}
												/>
												<button
													type="button"
													className={quiet}
													disabled={!canAdjust || adjust.isPending}
													onClick={() =>
														adjust.mutate({
															id: item.id,
															kind: "receive",
															quantity: amount,
														})
													}
												>
													Receive
												</button>
												<button
													type="button"
													className={quiet}
													disabled={!canAdjust || adjust.isPending}
													onClick={() =>
														adjust.mutate({
															id: item.id,
															kind: "correction_out",
															quantity: amount,
														})
													}
												>
													Remove
												</button>
											</div>
										);
									},
								},
							]}
						/>
					);
				}}
			</PageState>
			{selected ? (
				<InventoryPanel
					workspaceId={workspaceId}
					id={selected.id}
					name={selected.name}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</main>
	);
}
