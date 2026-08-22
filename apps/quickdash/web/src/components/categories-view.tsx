import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { type CategoryNode, CategoryPanel } from "./category-panel";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Choice, Text as TextField } from "./product-fields";

/**
 * Categories and collections — how a shop is organised.
 *
 * 🔑 One screen for both, because they differ in meaning and nothing else: a
 * category is where a thing belongs, a collection is a curated grouping. The
 * backend models them as one tree with a `kind`, and splitting them here would
 * invent a distinction the data does not have.
 *
 * ⚠️ Reads with `visibleOnly=false`. A storefront must see only visible ones;
 * an operator managing them must see the hidden ones too, or a category they
 * just hid vanishes from the page that hid it.
 */

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
	"h-9 w-full rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

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
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<"category" | "collection">("category");
	const [failure, setFailure] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const categories = useQuery({
		queryKey: ["quickdash", workspaceId, "categories"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: CategoryNode[] }>(
					"/categories?visibleOnly=false",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "categories"],
		});

	const create = useMutation({
		mutationFn: async () => {
			const label = name.trim();
			await workspaceApi(workspaceId).catalog.createCategory(
				{
					name: label,
					kind,
					// 🔑 Derived, not asked for. The slug is what appears in the shop's
					// URL, and making somebody type "Rough Gemstones" then
					// "rough-gemstones" is two chances to get it wrong for one fact.
					// It stays editable later, when the URL actually matters to them.
					slug: label
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-|-$/g, "")
						.slice(0, 60),
				},
				crypto.randomUUID(),
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be created."),
		onSuccess: () => {
			setCreating(false);
			setName("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "New category",
		onClick: () => setCreating((open) => !open),
	});

	const setVisible = useMutation({
		mutationFn: async (input: { id: string; visible: boolean }) => {
			await workspaceApi(workspaceId).catalog.updateCategory(
				input.id,
				{ visible: input.visible },
				crypto.randomUUID(),
			);
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: refresh,
	});

	// The tree is nested, so the selected node has to be found through it rather
	// than looked up in a flat list.
	const selected =
		flatten(categories.data?.items ?? []).find(
			({ node }) => node.id === selectedId,
		)?.node ?? null;

	const remove = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).catalog.deleteCategory(
				id,
				crypto.randomUUID(),
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be deleted."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New category"
					submitLabel="Add"
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="Single origin"
					/>
					<Choice
						label="Kind"
						hint="a collection is curated"
						options={["category", "collection"]}
						value={kind}
						onChange={(value) => setKind(value as "category" | "collection")}
					/>
				</CreatePanel>
			) : null}

			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search categories"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

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
							!needle ||
							node.name.toLowerCase().includes(needle) ||
							node.slug.toLowerCase().includes(needle),
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
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Categories"
							rows={rows.map(({ node, depth }) => ({ ...node, depth }))}
							selectedId={selectedId}
							onOpen={(node) => setSelectedId(node.id)}
							columns={[
								{
									key: "name",
									header: "Name",
									render: (node) => (
										// Depth as indentation, so a child reads as belonging to
										// its parent rather than as a sibling.
										<span style={{ paddingLeft: `${node.depth * 18}px` }}>
											{node.name}
											{node.kind === "collection" ? (
												<span className="ml-2 rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]">
													collection
												</span>
											) : null}
										</span>
									),
								},
								{
									key: "slug",
									header: "Address",
									width: "w-48",
									render: (node) => (
										<span className="font-mono text-[10.5px] text-[var(--ink-30)]">
											/{node.slug}
										</span>
									),
								},
								{
									key: "items",
									header: "Items",
									width: "w-20",
									align: "right",
									tight: true,
									render: (node) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{node.itemCount}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (node) => (
										<div className="flex items-center justify-end gap-1.5">
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(setVisible, node.id)}
												onClick={() =>
													setVisible.mutate({
														id: node.id,
														visible: !node.visible,
													})
												}
											>
												{node.visible ? "Visible" : "Hidden"}
											</button>
											<button
												type="button"
												className={quiet}
												onClick={() => setSelectedId(node.id)}
											>
												Edit
											</button>
											<button
												type="button"
												className={quiet}
												disabled={rowBusy(remove, node.id)}
												onClick={() => remove.mutate(node.id)}
											>
												Delete
											</button>
										</div>
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
