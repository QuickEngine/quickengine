import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useAcknowledgeRecord } from "../lib/record-signals";
import { useSelectedRecord } from "../lib/selected-record";
import { type CategoryNode, CategoryPanel } from "./category-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";

// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.

/**
 * Categories and collections — how a shop is organised.
 *
 * 🔑 One screen for both, because they differ in meaning and nothing else: a
 * category is where a thing belongs, a collection is a curated grouping. The
 * backend models them as one tree with a `kind`, and splitting them here would
 * invent a distinction the data does not have.
 *
 * ⚠️ Reads with `includeHidden=true`. A storefront must see only visible ones;
 * an operator managing them must see the hidden ones too, or a category they
 * just hid vanishes from the page that hid it.
 */

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:opacity-40";

const _field =
	"h-9 w-full field rounded-md px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-20)]";

/** Depth-first, so a child always renders under its parent rather than beside it. */
function flatten(
	nodes: CategoryNode[],
	depth = 0,
): Array<{ node: CategoryNode; depth: number }> {
	return nodes.flatMap((node) => [
		{ node, depth },
		...flatten(node.children ?? [], depth + 1),
	]);
}

export function CategoriesView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
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
	const [selectedId, setSelectedId] = useSelectedRecord();
	// Opening a record accounts for whatever it was flagged for.
	useAcknowledgeRecord(workspaceId, selectedId);
	const [search, setSearch] = useState("");

	const categories = useQuery({
		queryKey: ["quickdash", workspaceId, "categories"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: CategoryNode[] }>(
					/*
					 * 🔴 `includeHidden`, NOT `visibleOnly`.
					 *
					 * The route reads `includeHidden !== "true"`. Sending
					 * `visibleOnly=false` matched nothing, so the parameter was
					 * ignored, hidden categories were filtered out server-side, and
					 * hiding one made its row VANISH from the operator's own list —
					 * with no way to find it again and unhide it.
					 *
					 * ⚠️ A silently ignored query parameter is the worst kind: the
					 * request succeeds, the response is well-formed, and it is simply
					 * answering a different question.
					 */
					"/categories?includeHidden=true",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "categories"],
		});

	/**
	 * 🔴 Creates the category and OPENS it, rather than asking for a name first.
	 *
	 * The old flow was: press +, type a name, save, close, find it in the list,
	 * open it — and only then meet description, picture, ordering and
	 * visibility. Six steps to reach the fields that matter, and no way to add
	 * the picture at the moment you were thinking about it.
	 *
	 * Products already work this way, so this is the console being consistent
	 * with itself rather than a new idea.
	 *
	 * ⚠️ The placeholder name is deliberate and visible. Saving blank would leave
	 * a nameless row if somebody wandered off; "Untitled" reads as unfinished.
	 */
	/**
	 * Drag a tile to change the order the shop browses in.
	 *
	 * 🔴 `sort_order` already existed and was already honoured — `listCategoryTree`
	 * orders by it and the storefront passes it straight through — but the only
	 * way to set it was to TYPE a number into the panel. The feature worked and
	 * nobody could reach it the way anybody would expect to.
	 *
	 * ⚠️ EVERY card is renumbered, not just the two that swapped. Writing one
	 * row's number leaves ties, and a tie falls back to name order — so the drag
	 * would appear to do nothing, or something arbitrary.
	 */
	const reorder = useMutation({
		mutationFn: async (ordered: CategoryNode[]) => {
			const api = workspaceApi(workspaceId);
			for (const [index, node] of ordered.entries()) {
				if (node.sortOrder === index) continue;
				await api.catalog.updateCategory(
					node.id,
					{ sortOrder: index },
					crypto.randomUUID(),
				);
			}
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That order could not be saved." }),
		onSuccess: () => refresh(),
	});

	const { layout, setLayout } = useListLayout(workspaceId);

	const create = useMutation({
		mutationFn: async () =>
			(
				await workspaceApi(workspaceId).catalog.createCategory(
					{
						name: "Untitled category",
						kind: "category",
						// Unique by construction: two untitled categories made moments
						// apart must not collide on a slug the shop routes by.
						slug: `untitled-${Date.now().toString(36)}`,
					},
					crypto.randomUUID(),
				)
			).data,
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That could not be created." }),
		onSuccess: async (created: { id: string }) => {
			await refresh();
			setSelectedId(created.id);
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add category",
		onClick: () => create.mutate(),
	});

	// The tree is nested, so the selected node has to be found through it rather
	// than looked up in a flat list.
	const selected =
		flatten(categories.data?.items ?? []).find(
			({ node }) => node.id === selectedId,
		)?.node ?? null;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("Kind", [
					"category",
					"collection",
					"featured",
					"hidden",
				])}
				filterCount={statusFilter.count}
				exportRows={() => categories.data?.items ?? []}
				exportName="categories"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search categories"
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={categories}
				loadingLabel="Loading categories…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No categories yet"
						detail="Categories group what you sell so a shop can be browsed. Add one above, then assign products to it from the product page."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = flatten(data.items).filter(
						({ node }) =>
							(statusFilter.count === 0 ||
								statusFilter.keep(node.kind) ||
								(node.featured && statusFilter.keep("featured")) ||
								(!node.visible && statusFilter.keep("hidden"))) &&
							(!needle ||
								node.name.toLowerCase().includes(needle) ||
								node.slug.toLowerCase().includes(needle)),
					);
					return (
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Categories"
							rows={rows.map(({ node }) => node)}
							selectedId={selectedId}
							onOpen={(node) => setSelectedId(node.id)}
							exportName="categories"
							/* Dragging a card is how a browse order is set, and the
							   shared table already does it: it keeps the arrangement per
							   workspace and refuses to drag while a column sort is
							   applied, which the private grid could not know about. The
							   move is still written back through `sortOrder`. */
							onReorder={(fromId, toId) => {
								const order = rows.map(({ node }) => node);
								const from = order.findIndex((node) => node.id === fromId);
								const to = order.findIndex((node) => node.id === toId);
								if (from < 0 || to < 0 || from === to) return;
								const [moved] = order.splice(from, 1);
								order.splice(to, 0, moved);
								reorder.mutate(order);
							}}
							empty={
								<EmptyState
									title="Nothing matches"
									detail="Try a different search, or clear the kind filter."
								/>
							}
							/* 🔴 The SAME card body this page always had, on the shared
							   frame. Categories drew its own grid of bordered buttons,
							   so it kept the flat outlines of the first UI pass while
							   every other list moved onto a raised surface, and it had
							   no view switch, no sort and no paging because none of that
							   lives in a hand written grid. The tiles are unchanged; the
							   object they sit in is now the console's. */
							renderCard={(node) => (
								<>
									{/* Square tile, because that is the shape a browse page
									    uses. */}
									{node.imageUrl ? (
										<img
											src={node.imageUrl}
											alt=""
											className="aspect-square w-full rounded-md object-cover"
										/>
									) : (
										<div className="flex aspect-square w-full items-center justify-center rounded-md border border-[var(--empty-line)] border-dashed text-[11px] text-[var(--ink-25)]">
											No picture
										</div>
									)}
									<p className="mt-2 line-clamp-2 text-[12.5px] text-[var(--ink-85)] leading-snug">
										{node.name}
									</p>
									<div className="mt-1.5 flex items-center gap-1.5">
										<span className="font-mono text-[10.5px] text-[var(--ink-30)]">
											/{node.slug}
										</span>
										<span className="ml-auto text-[11px] text-[var(--ink-30)]">
											{node.itemCount} {node.itemCount === 1 ? "item" : "items"}
										</span>
									</div>
									{!node.visible ? (
										<span className="mt-1.5 inline-block rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[var(--signal-attention-text)]">
											Hidden
										</span>
									) : null}
								</>
							)}
							columns={[
								{
									key: "name",
									header: "Category",
									render: (node) => (
										<span className="min-w-0 truncate">{node.name}</span>
									),
								},
								{
									key: "slug",
									header: "Slug",
									render: (node) => (
										<span className="font-mono text-[11px] text-[var(--ink-45)]">
											/{node.slug}
										</span>
									),
								},
								{
									key: "kind",
									header: "Kind",
									render: (node) => (
										<span className="capitalize">{node.kind}</span>
									),
								},
								{
									key: "itemCount",
									header: "Items",
									render: (node) => node.itemCount,
								},
								{
									key: "visible",
									header: "Visible",
									render: (node) =>
										node.visible ? (
											"Visible"
										) : (
											<span className="text-[var(--signal-attention-text)]">
												Hidden
											</span>
										),
								},
							]}
						/>
					);
				}}
			</PageState>

			{/* Resolved from the live tree rather than held as its own copy, so a save
			    is reflected in the panel as soon as the query refetches. */}
			{selected ? (
				<CategoryPanel
					workspaceId={workspaceId}
					node={selected}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
