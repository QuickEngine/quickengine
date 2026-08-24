import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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

	/**
	 * 🔴 A category tile needs a PICTURE, and the only way in was to paste a URL.
	 *
	 * That is not something a shop owner can do for a photograph sitting on their
	 * desktop, so browse tiles stayed blank on a shop whose whole appeal is what
	 * the things look like. The upload existed — it just had no control here.
	 *
	 * ⚠️ Fills the address field rather than saving on its own, so the picture is
	 * committed with the rest of the form. An upload that saved immediately would
	 * make a cancelled edit still have changed something.
	 */
	const fileInput = useRef<HTMLInputElement | null>(null);
	const [dragging, setDragging] = useState(false);

	const uploadImage = useMutation({
		mutationFn: async (file: File) => {
			const form = new FormData();
			form.set("file", file);
			const result = await workspaceApi(workspaceId).request<{ url: string }>(
				"/quickdash/images",
				{ method: "POST", body: form },
			);
			return result.data.url;
		},
		onSuccess: (url) => set("imageUrl", url),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That picture could not be uploaded."),
	});

	/**
	 * 🔴 Deleting a category lived in the list's table row, and the list is now
	 * cards — so for a while there was NO way to delete one at all.
	 *
	 * It belongs here anyway: deleting is a decision you make while looking at
	 * the thing, not while scanning a list, and a destructive action one stray
	 * click from a row is a destructive action somebody performs by accident.
	 *
	 * ⚠️ Confirmed before it runs. Deleting a category unfiles every product in
	 * it, which is invisible from this panel and not obviously undoable.
	 */
	const remove = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).catalog.deleteCategory(
				node.id,
				crypto.randomUUID(),
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be deleted."),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "categories"],
			});
			onClose();
		},
	});

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
						placeholder="Monitors"
					/>
					<Text
						label="Web address"
						hint="the last part of the link"
						value={draft.slug}
						onChange={(value) => set("slug", value)}
						placeholder="monitors"
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
					<div>
						<Text
							label="Image address"
							hint="shown on browse tiles"
							value={draft.imageUrl}
							onChange={(value) => set("imageUrl", value)}
							placeholder="https://…"
						/>

						{draft.imageUrl ? (
							<div className="mt-1.5 flex items-center gap-2">
								<img
									src={draft.imageUrl}
									alt=""
									className="h-16 w-16 shrink-0 rounded-lg border border-[var(--console-line)] object-cover"
								/>
								<button
									type="button"
									className="inline-flex h-7 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
									onClick={() => set("imageUrl", "")}
								>
									Remove
								</button>
							</div>
						) : null}

						{/* The same drop target the product panel uses, because half of
						    people will drag and half will click, and neither should have
						    to discover the other. A category tile with no picture is a
						    blank square on a shop whose whole appeal is what the things
						    look like. */}
						<button
							type="button"
							onClick={() => fileInput.current?.click()}
							onDragOver={(event) => {
								event.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={(event) => {
								event.preventDefault();
								setDragging(false);
								// Snapshotted: the mutation body runs after this handler
								// returns, and `dataTransfer` may not still be readable.
								const file = Array.from(event.dataTransfer.files)[0];
								if (file) uploadImage.mutate(file);
							}}
							className={`${uploadImage.isPending ? "shimmer-busy" : ""} mt-1.5 flex h-24 w-full items-center justify-center rounded-xl border border-dashed text-[11.5px] transition-colors ${
								dragging
									? "border-[rgb(var(--console-ink)/0.4)] bg-[rgb(var(--console-ink)/0.05)] text-[var(--ink-85)]"
									: "border-[var(--console-line-strong)] text-[var(--ink-30)] hover:text-[var(--ink-60)]"
							}`}
						>
							{uploadImage.isPending
								? "Uploading…"
								: draft.imageUrl
									? "Drop a new image here, or click to pick"
									: "Drop an image here, or click to pick"}
						</button>

						<input
							ref={fileInput}
							type="file"
							accept="image/*"
							hidden
							onChange={(event) => {
								/**
								 * 🔴 SNAPSHOT FIRST. `FileList` is LIVE — a view onto the
								 * input, not a copy — so clearing `value` empties the list
								 * the mutation is about to read.
								 */
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) uploadImage.mutate(file);
							}}
						/>
					</div>
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
				<button
					type="button"
					disabled={remove.isPending}
					onClick={() => {
						if (
							window.confirm(
								`Delete “${node.name}”? Products in it stay, but they stop being filed under it.`,
							)
						) {
							remove.mutate();
						}
					}}
					className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-full border border-[var(--console-line-strong)] text-[12.5px] text-[var(--ink-50)] transition-colors hover:text-[var(--signal-failure)] disabled:opacity-40"
				>
					{remove.isPending ? "Deleting…" : "Delete category"}
				</button>
			</footer>
		</aside>
	);
}
