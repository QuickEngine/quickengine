import { ImageIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { type CatalogItem, compareAt, imagesOf, money } from "../lib/catalog";
import { useListLayout } from "../lib/list-view";
import { useSelectedRecord } from "../lib/selected-record";
import { useHeaderAction, useHeaderCrumb } from "./header-action";
import { ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";
import { ProductPanel } from "./product-panel";

const chip =
	"rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]";

const STATUSES = ["active", "draft", "archived"] as const;

function Thumb({ item, size }: { item: CatalogItem; size: "sm" | "lg" }) {
	const [broken, setBroken] = useState(false);
	const url = imagesOf(item.metadata)[0];
	const box =
		size === "lg"
			? // Square, matching the category tiles — the two grids sit one click
				// apart and a card that changes shape between them reads as a
				// different kind of thing. Square is also what a browse page uses.
				"aspect-square w-full rounded-lg"
			: // 28px, not 36. A table row is 40px tall, so a 36px thumbnail left
				// two pixels of air and pushed the row taller than every other
				// list in the console. This sits inside the row it belongs to.
				"size-7 shrink-0 rounded-md";

	// 🔴 A missing image is the NORMAL state here, not an error: an imported
	// catalog arrives with none, and a broken <img> icon would read as a fault in
	// QuickDash rather than a photograph nobody has uploaded yet.
	if (!url || broken) {
		return (
			<div
				className={`${box} flex items-center justify-center border border-[var(--console-line-soft)] bg-[rgb(var(--console-ink)/0.03)]`}
			>
				<ImageIcon
					size={size === "lg" ? 22 : 12}
					className="text-[var(--ink-20)]"
				/>
			</div>
		);
	}
	return (
		<img
			src={url}
			alt=""
			loading="lazy"
			onError={() => setBroken(true)}
			className={`${box} border border-[var(--console-line-soft)] object-cover`}
		/>
	);
}

/**
 * One product's photographs.
 *
 * Upload, remove and reorder — the whole reason this page exists right now, and
 * the only thing standing between an imported catalog and a storefront that
 * looks finished.
 *
 * 🔑 Position matters, it is not decoration: the FIRST image is what a shopper
 * sees in a product grid, so reordering is an editorial act and the panel says
 * so rather than leaving people to discover it.
 */
export function ProductsView({ workspaceId }: { workspaceId: string }) {
	const [query, setQuery] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [selectedId, setSelectedId] = useSelectedRecord();
	const { layout, setLayout } = useListLayout(workspaceId);

	const queryClient = useQueryClient();

	const catalog = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog"],
		queryFn: async () =>
			(await workspaceApi(workspaceId).catalog.list({ limit: 100 })).data,
	});

	/**
	 * Create, then open.
	 *
	 * 🔑 A new product is written immediately as a DRAFT with nothing but a
	 * placeholder name, and the panel opens on it. The alternative — a blank
	 * modal that only saves once every required field is filled — makes somebody
	 * finish a form before they can see what a product even has on it, and loses
	 * everything if they close it. A draft is invisible to shoppers, so an
	 * abandoned one costs nothing.
	 */
	const create = useMutation({
		mutationFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ id: string }>("/catalog", {
					method: "POST",
					body: {
						name: "Untitled product",
						type: "physical",
						status: "draft",
						pricingModel: "fixed",
						priceCents: 0,
					},
					idempotencyKey: crypto.randomUUID(),
				})
			).data,
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "catalog"],
			});
			setSelectedId(created.id);
		},
	});

	const items = ((catalog.data?.items ?? []) as CatalogItem[])
		.filter((item) =>
			statuses.length === 0 ? true : statuses.includes(item.status),
		)
		.filter((item) =>
			query.trim().length === 0
				? true
				: item.name.toLowerCase().includes(query.trim().toLowerCase()),
		);

	/**
	 * ⚠️ Paging, sorting and selection now belong to `PagedTable`, which every
	 * other list already used. Products kept its own copy of all three — and
	 * with them its own grid, which is how it ended up the one card view with
	 * no surface, no shadow and no table view at all.
	 */

	// Resolved from the live list rather than held as its own copy, so an upload
	// shows in the panel the moment the query refetches.
	const selected =
		((catalog.data?.items ?? []) as CatalogItem[]).find(
			(item) => item.id === selectedId,
		) ?? null;

	// The page's one create action lives in the header, where every page keeps
	// its own — so "make a new thing" is always in the same place.
	useHeaderAction({
		label: "Add product",
		busyLabel: "Adding…",
		busy: create.isPending,
		onClick: () => create.mutate(),
	});
	useHeaderCrumb(selected?.name ?? null);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{/* 🔴 The SHARED control bar, not a private copy.
			    Products had its own search box and filter popover, which meant it
			    was the one page whose chrome stayed on screen behind a page-level
			    wall — offering a search over a list that could not exist. */}
			<ListControls
				onClearFilter={() => setStatuses([])}
				exportRows={() => items}
				exportName="products"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={query}
				onQueryChange={setQuery}
				placeholder="Search products"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => {
								const on = statuses.includes(status);
								return (
									<button
										key={status}
										type="button"
										onClick={() =>
											setStatuses(
												on
													? statuses.filter((value) => value !== status)
													: [...statuses, status],
											)
										}
										className={`h-7 rounded-full border px-3 text-[11px] capitalize transition-colors ${
											on
												? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
												: "border-[var(--console-line-strong)] text-[var(--ink-60)] hover:text-[var(--ink-90)]"
										}`}
									>
										{status}
									</button>
								);
							})}
						</div>
					</>
				}
			/>

			<PageState
				query={catalog}
				loadingLabel="Loading products…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No products yet"
						detail="A product is anything this business sells. Add one and it stays a draft until you put it on sale, so nothing reaches your shop before you are ready."
					/>
				}
			>
				{() => (
					<PagedTable
						workspaceId={workspaceId}
						layout={layout}
						caption="Products"
						rows={items}
						selectedId={selectedId}
						onOpen={(item) => setSelectedId(item.id)}
						exportName="products"
						empty={
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						}
						/* 🔑 The catalogue is scanned by PICTURE. The generic card
						   leads with the first column and labels the rest, which is
						   right for an order and wrong for a product — so this page
						   keeps its own card body and takes the frame, the lift and
						   the selection border from the shared one. */
						renderCard={(item) => {
							const original = compareAt(item.metadata);
							return (
								<>
									<Thumb item={item} size="lg" />
									<p className="mt-2.5 line-clamp-2 text-[12.5px] text-[var(--ink-85)] leading-snug">
										{item.name}
									</p>
									<div className="mt-1.5 flex items-baseline gap-1.5">
										<span className="text-[12.5px] text-[var(--ink-85)]">
											{money(item.priceCents, item.currency)}
										</span>
										{original != null && original !== item.priceCents ? (
											<span className="text-[11px] text-[var(--ink-30)] line-through">
												{money(original, item.currency)}
											</span>
										) : null}
										{item.status !== "active" ? (
											<span className={`${chip} ml-auto capitalize`}>
												{item.status}
											</span>
										) : null}
									</div>
								</>
							);
						}}
						columns={[
							{
								key: "name",
								header: "Product",
								render: (item) => (
									<span className="flex items-center gap-2.5">
										<Thumb item={item} size="sm" />
										<span className="min-w-0 truncate">{item.name}</span>
									</span>
								),
							},
							{
								key: "price",
								header: "Price",
								render: (item) => money(item.priceCents, item.currency),
							},
							{
								key: "status",
								header: "Status",
								render: (item) => (
									<span className={`${chip} capitalize`}>{item.status}</span>
								),
							},
						]}
					/>
				)}
			</PageState>

			{selected ? (
				<ProductPanel
					workspaceId={workspaceId}
					item={selected}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
