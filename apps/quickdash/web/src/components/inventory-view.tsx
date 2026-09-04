import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { InventoryPanel } from "./inventory-panel";
import { FilterChip, ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
import { Choice, Text as TextField } from "./product-fields";

/**
 * Stock levels — what is actually on the shelf.
 *
 * 🔴 On hand and RESERVED are different numbers and both matter. Checkout
 * reserves stock before an order is paid, so an item can show three on hand
 * with three reserved and be genuinely unsellable. A page showing only "3"
 * would have somebody promise stock that is already spoken for.
 *
 * 🔑 A product only appears here once it is TRACKED, and tracking is started
 * from this page. Until it was, a new product could never be stocked from the
 * console at all — the record had to be created through the API first, which
 * meant the whole screen was unreachable for anything newly added.
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

// Matched to `quiet` rather than the console's usual field: this input sits
// between two pill buttons, so a taller square-cornered box breaks the row's
// shared edge. Same height, same radius, same border — it reads as one control
// group instead of a form dropped into a table cell.
const field =
	"h-7 w-16 shrink-0 rounded-full border border-[var(--console-line-strong)] bg-transparent px-2.5 text-[11px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)]";

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
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	// The panel needs the product NAME, which the inventory row does not carry.
	const [selected, setSelected] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [search, setSearch] = useState("");
	const [lowOnly, setLowOnly] = useState(false);
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
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [tracking, setTracking] = useState(false);
	const [product, setProduct] = useState("");
	const [threshold, setThreshold] = useState("");

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
			const products = catalog.data.items as CatalogItem[];
			return {
				items: levels.data.items,
				// Kept as a list as well as a lookup: starting to track something
				// needs the products that are NOT here yet, which a Map cannot answer.
				products,
				names: new Map(products.map((item) => [item.id, item.name])),
			};
		},
	});

	/** Products that exist but are not counted yet. The only valid choices. */
	const untracked = (inventory.data?.products ?? []).filter(
		(item) =>
			!(inventory.data?.items ?? []).some(
				(row) => row.catalogItemId === item.id,
			),
	);

	const track = useMutation({
		mutationFn: async () => {
			const chosen = untracked.find((item) => item.name === product);
			if (!chosen) throw new Error("Choose a product to track.");
			const warnAt = Number(threshold.trim());
			await workspaceApi(workspaceId).request("/inventory", {
				method: "POST",
				idempotencyKey: crypto.randomUUID(),
				body: {
					catalogItemId: chosen.id,
					lowStockThreshold:
						Number.isFinite(warnAt) && warnAt > 0 ? Math.round(warnAt) : 0,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That product could not be tracked.",
			}),
		onSuccess: () => {
			setTracking(false);
			setProduct("");
			setThreshold("");
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "inventory"],
			});
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
			setFailure({ error: error, fallback: "That adjustment did not save." }),
		onSuccess: (_result, input) => {
			setDrafts((current) => ({ ...current, [input.id]: "" }));
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "inventory"],
			});
		},
	});

	useHeaderAction({
		label: "Track a product",
		onClick: () => setTracking((was) => !was),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{tracking ? (
				<CreatePanel
					title="Start counting a product"
					submitLabel="Track it"
					busy={track.isPending}
					valid={!!product}
					blockedReason={"Choose a product and a quantity"}
					failure={failure}
					onClose={() => setTracking(false)}
					onSubmit={() => track.mutate()}
				>
					{untracked.length === 0 ? (
						<p className="text-[11.5px] text-[var(--ink-30)] leading-4">
							Every product is already counted. Anything new appears here once
							it is added to the catalog.
						</p>
					) : (
						<>
							<Choice
								label="Product"
								options={untracked.map((item) => item.name)}
								value={product}
								onChange={setProduct}
							/>
							<TextField
								label="Warn at"
								hint="optional, 0 means never warn"
								value={threshold}
								onChange={setThreshold}
								placeholder="5"
								inputMode="decimal"
							/>
							{/* 🔑 Said plainly, because it surprises people: tracking starts
							    at zero and the product reads as out of stock until a delivery
							    is recorded. Better to say so than to have somebody think the
							    save failed. */}
							<p className="mt-1 text-[11px] text-[var(--ink-30)] leading-4">
								It starts at none in stock. Record what arrived from the
								product's row, or from its panel.
							</p>
						</>
					)}
				</CreatePanel>
			) : null}

			<ListControls
				onClearFilter={() => setLowOnly(false)}
				exportRows={() => inventory.data?.items ?? []}
				exportName="inventory"
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
				<WriteFailure error={failure.error} message={failure.fallback} />
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

					return (
						<PagedTable
							empty={
								<EmptyState
									title="Nothing matches"
									detail={
										lowOnly
											? "Nothing is low on stock. Clear the filter to see everything."
											: "Try a different search."
									}
								/>
							}
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
													? "text-[var(--signal-attention-text)]"
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
												{/* 🔴 Clicks stop at each control.
												    The row opens the detail panel, so a click in here
												    bubbled up and opened it — and the panel then
												    covered the very control being aimed at. The only
												    way to reach the box was to click-and-hold, because
												    a drag is not a click. Guarding the controls rather
												    than wrapping them in a click-catching div keeps
												    the cell a plain container. */}
												<input
													value={draft}
													onClick={(event) => event.stopPropagation()}
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
													onClick={(event) => {
														event.stopPropagation();
														adjust.mutate({
															id: item.id,
															kind: "receive",
															quantity: amount,
														});
													}}
												>
													Receive
												</button>
												<button
													type="button"
													className={quiet}
													disabled={!canAdjust || adjust.isPending}
													onClick={(event) => {
														event.stopPropagation();
														adjust.mutate({
															id: item.id,
															kind: "correction_out",
															quantity: amount,
														});
													}}
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
