import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

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

type CategoryNode = {
	id: string;
	kind: "category" | "collection";
	name: string;
	slug: string;
	description: string | null;
	parentId: string | null;
	sortOrder: number;
	imageUrl: string | null;
	featured: boolean;
	visible: boolean;
	itemCount: number;
	children: CategoryNode[];
};

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
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
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [kind, setKind] = useState<"category" | "collection">("category");
	const [failure, setFailure] = useState<string | null>(null);
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
			setName("");
			refresh();
		},
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
			<form
				className="mb-4 flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) create.mutate();
				}}
			>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="New category or collection"
					className={`${field} max-w-sm`}
				/>
				{/* Two buttons rather than a select: the choice has exactly two values,
				    and an OS dropdown for two options is a click nobody needs. */}
				<div className="flex h-9 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5">
					{(["category", "collection"] as const).map((option) => (
						<button
							key={option}
							type="button"
							onClick={() => setKind(option)}
							className={`h-8 rounded-full px-3 text-[11.5px] capitalize transition-colors ${
								kind === option
									? "bg-[var(--console-pop)] text-[var(--ink-90)]"
									: "text-[var(--ink-30)] hover:text-[var(--ink-60)]"
							}`}
						>
							{option}
						</button>
					))}
				</div>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !name.trim()}
				>
					{create.isPending ? "Adding…" : "Add"}
				</button>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search categories"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
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
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{rows.map(({ node, depth }) => (
								<div key={node.id} className="flex items-center gap-3 py-2.5">
									<div
										className="min-w-0 flex-1"
										style={{ paddingLeft: `${depth * 18}px` }}
									>
										<p className="truncate text-[12.5px] text-[var(--ink-85)]">
											{node.name}
											{node.kind === "collection" ? (
												<span className="ml-2 rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]">
													collection
												</span>
											) : null}
										</p>
										<p className="truncate font-mono text-[10.5px] text-[var(--ink-30)]">
											/{node.slug}
										</p>
									</div>

									<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
										{node.itemCount} {node.itemCount === 1 ? "item" : "items"}
									</span>

									{/* Hidden is a real state worth seeing, not an absence: a
								    category can exist, hold products, and simply not appear on
								    the shop — and somebody wondering why will look here. */}
									<button
										type="button"
										className={quiet}
										disabled={rowBusy(setVisible, node.id)}
										onClick={() =>
											setVisible.mutate({ id: node.id, visible: !node.visible })
										}
									>
										{node.visible ? "Visible" : "Hidden"}
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
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
