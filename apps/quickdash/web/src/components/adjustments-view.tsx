import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";

/**
 * Every stock movement, and what it left behind.
 *
 * 🔑 This is the answer to "where did my stock go". A level is a number; an
 * adjustment says who moved it, which way, and what the balance became — so a
 * count that looks wrong can be traced rather than argued about.
 */

type Adjustment = {
	id: string;
	inventoryItemId: string;
	kind: string;
	quantity: number;
	onHandDelta: number;
	reservedDelta: number;
	resultingOnHand: number;
	resultingReserved: number;
	note: string | null;
	createdAt: string;
};

type InventoryItem = { id: string; catalogItemId: string };
type CatalogItem = { id: string; name: string };

/** Plain words for what each movement means. */
const KIND_LABELS: Record<string, string> = {
	receive: "Received",
	sale: "Sold",
	customer_return: "Returned by customer",
	damage: "Damaged",
	correction_in: "Corrected up",
	correction_out: "Corrected down",
	reserve: "Reserved for an order",
	release: "Reservation released",
	fulfill_reserved: "Shipped from reserved",
};

export function AdjustmentsView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const statusFilter = useChipFilter();
	const [search, setSearch] = useState("");

	const history = useQuery({
		queryKey: ["quickdash", workspaceId, "adjustments"],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			const [levels, catalog] = await Promise.all([
				api.request<{ items: InventoryItem[] }>("/inventory?limit=100"),
				api.catalog.list({ limit: 100 }),
			]);
			const names = new Map(
				(catalog.data.items as CatalogItem[]).map((item) => [
					item.id,
					item.name,
				]),
			);
			// ⚠️ Adjustments are recorded PER inventory item, so a workspace-wide
			// history has to be gathered and merged. Bounded to the tracked items
			// already loaded, so this cannot fan out unboundedly.
			const perItem = await Promise.all(
				levels.data.items.map(async (item) => {
					const page = await api.inventory.listAdjustments(item.id, {
						limit: 50,
					});
					return (page.data as { items: Adjustment[] }).items.map(
						(adjustment) => ({
							adjustment,
							name: names.get(item.catalogItemId) ?? "Unnamed product",
						}),
					);
				}),
			);
			return {
				rows: perItem
					.flat()
					.sort((a, b) =>
						b.adjustment.createdAt.localeCompare(a.adjustment.createdAt),
					),
			};
		},
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				filter={statusFilter.chips("Movement", [
					"receive",
					"sale",
					"return",
					"correction",
					"damage",
					"reserve",
					"release",
					"fulfill_reserved",
					"transfer",
				])}
				filterCount={statusFilter.count}
				exportRows={() => history.data?.rows ?? []}
				exportName="stock-adjustments"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search movements by product"
			/>

			<PageState
				query={history}
				loadingLabel="Loading movements…"
				isEmpty={(data) => data.rows.length === 0}
				empty={
					<EmptyState
						title="No stock movements yet"
						detail="Receiving stock, selling it and correcting a count all appear here, newest first."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.rows.filter(
						(row) =>
							statusFilter.keep(row.adjustment.kind) &&
							(!needle || row.name.toLowerCase().includes(needle)),
					);
					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}
					return (
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Stock movements"
							rows={rows.map(({ adjustment, name }) => ({
								...adjustment,
								name,
							}))}
							columns={[
								{
									key: "product",
									header: "Product",
									render: (row) => row.name,
								},
								{
									key: "kind",
									header: "Movement",
									width: "w-40",
									tight: true,
									render: (row) => (
										<span className="text-[12px] text-[var(--ink-60)]">
											{KIND_LABELS[row.kind] ?? row.kind}
										</span>
									),
								},
								{
									key: "delta",
									header: "Change",
									width: "w-20",
									align: "right",
									tight: true,
									// Signed, because direction is the whole point. A movement of
									// "5" tells you nothing without knowing which way.
									render: (row) => (
										<span
											className={
												row.onHandDelta < 0
													? "text-[var(--ink-45)]"
													: "text-[var(--ink-85)]"
											}
										>
											{row.onHandDelta > 0 ? "+" : ""}
											{row.onHandDelta}
										</span>
									),
								},
								{
									key: "left",
									header: "Left",
									width: "w-20",
									align: "right",
									tight: true,
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{row.resultingOnHand}
										</span>
									),
								},
								{
									key: "when",
									header: "When",
									width: "w-28",
									align: "right",
									tight: true,
									render: (row) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(row.createdAt).toLocaleDateString()}
										</span>
									),
								},
							]}
						/>
					);
				}}
			</PageState>
		</main>
	);
}
