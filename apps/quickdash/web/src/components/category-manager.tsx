"use client";

import { FolderOpen, Plus, Trash } from "@phosphor-icons/react";
import type { QuickCategoryNode } from "@quickengine/quick/browser";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@quickengine/ui/components/ui/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@quickengine/ui/components/ui/empty";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";
import { Textarea } from "@quickengine/ui/components/ui/textarea";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
	type CatalogActionState,
	deleteCategoryAction,
	saveCategoryAction,
} from "../_lib/catalog-actions";
import { useRouter } from "../compat/router-navigation";

const EMPTY: CatalogActionState = { error: null, completionId: null };

function Submit({ children }: { children: React.ReactNode }) {
	const { pending } = useFormStatus();
	return (
		<Button type="submit" disabled={pending}>
			{pending ? "Saving…" : children}
		</Button>
	);
}

/**
 * How a shop arranges what it sells.
 *
 * 🔴 Until this existed there was no way to create a category in the product at
 * all — the API had full CRUD and nothing called it, so a storefront that groups
 * products by category (most of them) could not be filled in without writing SQL.
 *
 * A category and a collection are the same shape and differ only in meaning: a
 * category is where a thing belongs, a collection is a curated grouping. One
 * form covers both because the server does.
 */
export function CategoryManager({
	workspaceId,
	categories,
}: {
	workspaceId: string;
	categories: QuickCategoryNode[];
}) {
	const router = useRouter();
	const [editing, setEditing] = useState<QuickCategoryNode | null>(null);
	const [open, setOpen] = useState(false);
	const [save, saveAction] = useActionState(saveCategoryAction, EMPTY);
	const [remove, removeAction] = useActionState(deleteCategoryAction, EMPTY);

	// Close and refresh only once the server has actually committed. Closing on
	// submit would show a stale list and hide any error the save returned.
	useEffect(() => {
		if (save.completionId) {
			setOpen(false);
			setEditing(null);
			router.refresh();
		}
	}, [save.completionId, router]);
	useEffect(() => {
		if (remove.completionId) router.refresh();
	}, [remove.completionId, router]);

	const form = (category: QuickCategoryNode | null) => (
		<form action={saveAction} className="space-y-4">
			<input type="hidden" name="workspaceId" value={workspaceId} />
			<input type="hidden" name="categoryId" value={category?.id ?? ""} />

			<div className="space-y-2">
				<Label htmlFor="category-name">Name</Label>
				<Input
					id="category-name"
					name="name"
					required
					maxLength={160}
					defaultValue={category?.name ?? ""}
					placeholder="Rings"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="category-slug">Web address</Label>
				<Input
					id="category-slug"
					name="slug"
					maxLength={160}
					defaultValue={category?.slug ?? ""}
					placeholder="rings"
					pattern="[a-z0-9\-]*"
				/>
				<p className="text-muted-foreground text-xs">
					What appears in your site's URL. Left blank, it is made from the name.
					Changing it on a live category breaks any link people already have.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="category-description">Description</Label>
				<Textarea
					id="category-description"
					name="description"
					rows={3}
					maxLength={2000}
					defaultValue={category?.description ?? ""}
					placeholder="Shown on the category page, if your site uses it."
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="category-image">Image address</Label>
				<Input
					id="category-image"
					name="imageUrl"
					type="url"
					maxLength={2048}
					defaultValue={category?.imageUrl ?? ""}
					placeholder="https://…"
				/>
				<p className="text-muted-foreground text-xs">
					A link to an image you already host. Uploading comes with Files.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="category-kind">Kind</Label>
				<NativeSelect
					id="category-kind"
					name="kind"
					defaultValue={category?.kind ?? "category"}
				>
					<option value="category">Category — where a product belongs</option>
					<option value="collection">Collection — a curated grouping</option>
				</NativeSelect>
			</div>

			<label className="flex items-start gap-3 text-sm">
				<input
					type="checkbox"
					name="visible"
					className="mt-1"
					defaultChecked={category?.visible ?? true}
				/>
				<span>
					Show on my website
					<span className="mt-0.5 block text-muted-foreground text-xs">
						Hidden categories stay out of your site's navigation. Useful for a
						seasonal collection you are still filling in.
					</span>
				</span>
			</label>

			{save.error && <p className="text-destructive text-sm">{save.error}</p>}

			<DialogFooter>
				<Submit>{category ? "Save changes" : "Create category"}</Submit>
			</DialogFooter>
		</form>
	);

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="font-medium text-lg">Categories</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						How your website groups what you sell. A product can be in more than
						one.
					</p>
				</div>
				<Dialog
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) setEditing(null);
					}}
				>
					<DialogTrigger asChild>
						<Button variant="outline" onClick={() => setEditing(null)}>
							<Plus className="size-4" /> Add category
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								{editing ? `Edit ${editing.name}` : "Add a category"}
							</DialogTitle>
							<DialogDescription>
								{editing
									? "Changes appear on your website immediately."
									: "Create a group, then add products to it from any product."}
							</DialogDescription>
						</DialogHeader>
						{form(editing)}
					</DialogContent>
				</Dialog>
			</div>

			{categories.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FolderOpen />
						</EmptyMedia>
						<EmptyTitle>No categories yet</EmptyTitle>
						<EmptyDescription>
							Most storefronts group products for browsing. If your site lists
							categories rather than products, it will look empty until one
							exists.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" onClick={() => setOpen(true)}>
							<Plus className="size-4" /> Add the first category
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="grid gap-3 md:grid-cols-2">
					{categories.map((category) => (
						<article
							key={category.id}
							className="flex items-start justify-between gap-3 rounded-xl border p-4"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="font-medium">{category.name}</h3>
									{category.kind === "collection" && (
										<Badge variant="secondary">Collection</Badge>
									)}
									{!category.visible && <Badge variant="outline">Hidden</Badge>}
								</div>
								<p className="mt-1 truncate text-muted-foreground text-xs">
									/{category.slug} ·{" "}
									{category.itemCount === 1
										? "1 product"
										: `${category.itemCount} products`}
								</p>
								{category.description && (
									<p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
										{category.description}
									</p>
								)}
							</div>
							<div className="flex shrink-0 gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setEditing(category);
										setOpen(true);
									}}
								>
									Edit
								</Button>
								<form action={removeAction}>
									<input type="hidden" name="workspaceId" value={workspaceId} />
									<input type="hidden" name="categoryId" value={category.id} />
									<Button
										size="sm"
										variant="outline"
										type="submit"
										onClick={(event) => {
											// Deleting a category never deletes its products — but
											// saying so is what stops somebody assuming it does.
											if (
												!window.confirm(
													`Delete "${category.name}"? Its ${category.itemCount} product(s) stay in your catalog and simply leave this group.`,
												)
											) {
												event.preventDefault();
											}
										}}
									>
										<Trash className="size-4" />
									</Button>
								</form>
							</div>
						</article>
					))}
				</div>
			)}
			{remove.error && (
				<p className="text-destructive text-sm">{remove.error}</p>
			)}
		</section>
	);
}
