import { ImageIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../lib/api";
import { type CatalogItem, compareAt, imagesOf, money } from "../lib/catalog";
import { PAGE_SIZE } from "../lib/list-view";
import { useHeaderAction, useHeaderCrumb } from "./header-action";
import { ListControls } from "./list-controls";
import { Pager } from "./list-layout";
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
			: "size-9 shrink-0 rounded-md";

	// 🔴 A missing image is the NORMAL state here, not an error: an imported
	// catalog arrives with none, and a broken <img> icon would read as a fault in
	// QuickDash rather than a photograph nobody has uploaded yet.
	if (!url || broken) {
		return (
			<div
				className={`${box} flex items-center justify-center border border-[var(--console-line-soft)] bg-[rgb(var(--console-ink)/0.03)]`}
			>
				<ImageIcon
					size={size === "lg" ? 22 : 14}
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [page, setPage] = useState(1);

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
	 * Paged like every other list, 25 at a time.
	 *
	 * 🔴 Products drew EVERY product in one grid while every other page in the
	 * console paged. A catalog of two thousand items rendered two thousand cards,
	 * each with an image, and the page that a shop opens most was the one that
	 * scaled worst.
	 *
	 * ⚠️ Clamped, not capped: narrowing a search while on page 4 must not strand
	 * somebody on an empty page with no way back.
	 */
	const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
	const current = Math.min(page, pageCount);
	const visible = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-page when the result set changes
	useEffect(() => {
		setPage(1);
	}, [items.length, workspaceId]);

	// Resolved from the live list rather than held as its own copy, so an upload
	// shows in the panel the moment the query refetches.
	const selected =
		((catalog.data?.items ?? []) as CatalogItem[]).find(
			(item) => item.id === selectedId,
		) ?? null;

	// The page's one create action lives in the header, where every page keeps
	// its own — so "make a new thing" is always in the same place.
	useHeaderAction({
		label: "New product",
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
				{() =>
					items.length === 0 ? (
						<EmptyState
							title="Nothing matches"
							detail="Try a different search, or clear the status filter."
						/>
					) : (
						<>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
								{visible.map((item) => {
									const original = compareAt(item.metadata);
									return (
										<button
											type="button"
											key={item.id}
											onClick={() => setSelectedId(item.id)}
											className={`cursor-pointer rounded-xl border p-2.5 text-left transition-colors ${
												selectedId === item.id
													? "border-[rgb(var(--console-ink)/0.35)]"
													: "border-[var(--console-line-soft)] hover:border-[var(--console-line-strong)]"
											}`}
										>
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
										</button>
									);
								})}
							</div>
							{/* Same pager as every other list, so turning a page feels
							    identical wherever you are. */}
							<Pager
								page={current}
								pageCount={pageCount}
								total={items.length}
								onPage={setPage}
							/>
						</>
					)
				}
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
