import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
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
						(row) => !needle || row.name.toLowerCase().includes(needle),
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
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{rows.map(({ adjustment, name }) => (
								<div
									key={adjustment.id}
									className="flex items-center gap-3 py-2.5"
								>
									<span className="w-40 shrink-0 truncate text-[12px] text-[var(--ink-60)]">
										{KIND_LABELS[adjustment.kind] ?? adjustment.kind}
									</span>
									<span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
										{name}
									</span>
									{/* Signed, because direction is the whole point. A movement
									    of "5" tells you nothing without knowing which way. */}
									<span
										className={`w-16 shrink-0 text-right text-[12px] ${
											adjustment.onHandDelta < 0
												? "text-[var(--ink-45)]"
												: "text-[var(--ink-85)]"
										}`}
									>
										{adjustment.onHandDelta > 0 ? "+" : ""}
										{adjustment.onHandDelta}
									</span>
									<span className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
										{adjustment.resultingOnHand} left
									</span>
									<span className="w-28 shrink-0 text-right text-[10.5px] text-[var(--ink-30)]">
										{new Date(adjustment.createdAt).toLocaleDateString()}
									</span>
								</div>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
