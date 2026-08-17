import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../lib/api";
import { detailCard } from "./detail-panel";
import { Area, Choice, Section, Text, Toggle } from "./product-fields";

/**
 * A category, opened.
 *
 * 🔑 Categories were creatable and deletable but never EDITABLE — a typo in a
 * name meant deleting the category, which unfiles every product in it, and
 * making it again. Description, image and ordering had no way in at all, so a
 * shop could not merchandise its own browse pages.
 *
 * Same panel shape as a product's, deliberately. Two different editors for two
 * things that sit next to each other in the same module is a cost paid by
 * whoever has to learn both.
 */

export type CategoryNode = {
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

type CategoryDraft = {
	name: string;
	slug: string;
	description: string;
	kind: string;
	imageUrl: string;
	sortOrder: string;
	featured: boolean;
	visible: boolean;
};

const draftFrom = (node: CategoryNode): CategoryDraft => ({
	name: node.name,
	slug: node.slug,
	description: node.description ?? "",
	kind: node.kind,
	imageUrl: node.imageUrl ?? "",
	sortOrder: String(node.sortOrder),
	featured: node.featured,
	visible: node.visible,
});

export function CategoryPanel({
	workspaceId,
	node,
	onClose,
}: {
	workspaceId: string;
	node: CategoryNode;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<CategoryDraft>(() => draftFrom(node));
	const [failure, setFailure] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on identity, not on every field
	useEffect(() => {
		setDraft(draftFrom(node));
		setFailure(null);
	}, [node.id]);

	const set = <K extends keyof CategoryDraft>(
		key: K,
		value: CategoryDraft[K],
	) => setDraft((current) => ({ ...current, [key]: value }));

	const save = useMutation({
		mutationFn: async () => {
			const order = Number(draft.sortOrder.trim());
			await workspaceApi(workspaceId).request(`/categories/${node.id}`, {
				method: "PATCH",
				body: {
					name: draft.name.trim(),
					slug: draft.slug.trim(),
					description: draft.description.trim() || null,
					kind: draft.kind,
					imageUrl: draft.imageUrl.trim() || null,
					sortOrder: Number.isFinite(order) ? order : 0,
					featured: draft.featured,
					visible: draft.visible,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "categories"],
			}),
	});

	const valid = draft.name.trim().length > 0 && draft.slug.trim().length > 0;

	return (
		<aside className={detailCard}>
			<header className="flex items-start gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12.5px] text-[var(--ink-85)]">
						{node.name}
					</p>
					<p className="text-[11px] text-[var(--ink-30)]">
						{node.itemCount} {node.itemCount === 1 ? "item" : "items"}
						<span className="text-[var(--ink-20)]">
							{" "}
							· {node.visible ? "visible" : "hidden"}
						</span>
					</p>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="h-7 rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
				>
					Close
				</button>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				<div className="space-y-3">
					<Text
						label="Name"
						value={draft.name}
						onChange={(value) => set("name", value)}
						placeholder="Rings"
					/>
					<Text
						label="Web address"
						hint="the last part of the link"
						value={draft.slug}
						onChange={(value) => set("slug", value)}
						placeholder="rings"
					/>
					<Area
						label="Description"
						hint="shown at the top of the browse page"
						rows={3}
						value={draft.description}
						onChange={(value) => set("description", value)}
					/>
				</div>

				<Section title="Merchandising" open>
					{/* A collection is a curated group ("Summer picks"); a category is
					    where a thing structurally belongs. Shops use both and mean
					    different things by them. */}
					<Choice
						label="Kind"
						hint="a collection is curated"
						options={["category", "collection"]}
						value={draft.kind}
						onChange={(value) => set("kind", value)}
					/>
					<Text
						label="Image address"
						hint="shown on browse tiles"
						value={draft.imageUrl}
						onChange={(value) => set("imageUrl", value)}
						placeholder="https://…"
					/>
					<Text
						label="Order"
						hint="lower shows first"
						value={draft.sortOrder}
						onChange={(value) => set("sortOrder", value)}
						placeholder="0"
						inputMode="decimal"
					/>
					<Toggle
						label="Feature this"
						hint="shops usually show these on the home page"
						value={draft.featured}
						onChange={(value) => set("featured", value)}
					/>
					<Toggle
						label="Visible in the shop"
						hint="hidden categories keep their products"
						value={draft.visible}
						onChange={(value) => set("visible", value)}
					/>
				</Section>
			</div>

			<footer className="shrink-0 border-[var(--console-line-soft)] border-t px-4 py-3">
				{failure ? (
					<p className="mb-2 text-[11.5px] text-[var(--signal-failure)]">
						{failure}
					</p>
				) : null}
				<button
					type="button"
					disabled={save.isPending || !valid}
					onClick={() => save.mutate()}
					className={`${save.isPending ? "shimmer-busy" : ""} inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
				>
					{save.isPending ? "Saving…" : "Save"}
				</button>
			</footer>
		</aside>
	);
}
