import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "../lib/api";
import {
	type CatalogItem,
	fromCents,
	imagesOf,
	metaFlag,
	metaTags,
	metaText,
	money,
	toCents,
} from "../lib/catalog";
import { parseAmount } from "../lib/money-input";
import { useOnline } from "../lib/online";
import { BlockFailure, detailCard } from "./detail-panel";
import { WriteFailure } from "./page-state";
import {
	Area,
	CATALOG_ITEM_TYPES,
	Choice,
	PRICING_MODELS,
	type ProductDraft,
	Section,
	Text,
	Toggle,
	wantsPrice,
} from "./product-fields";

/**
 * A product, opened.
 *
 * 🔑 A PANEL rather than its own page, deliberately. Cataloguing is bulk work:
 * you add a product, then the next, then fix a price three rows up. Keeping the
 * list visible beside the form means moving between items is one click instead
 * of navigate, edit, go back, find your place again.
 *
 * ⚠️ Fields are a local draft committed on Save, not saved per keystroke. A
 * catalog entry is a set of decisions that only make sense together — a price
 * without its pricing model is a request the API rejects — so it is edited as
 * one form and written once.
 */

/** Which statuses the API will actually accept from here. Mirrors the module. */
const NEXT_STATUSES: Record<string, string[]> = {
	draft: ["active", "archived"],
	active: ["draft", "archived"],
	archived: ["draft"],
};

/**
 * What a status change MEANS, which depends on where you are as well as where
 * you are going.
 *
 * ⚠️ `→ draft` is two different acts. From `active` it takes a product off the
 * shop; from `archived` it brings a retired one back. Labelling both "Take off
 * sale" told somebody restoring a product that they were removing it.
 *
 * 🔴 And NOT "put on sale". In a shop, "on sale" means discounted — so the one
 * button that publishes a product read as applying a markdown, and the way to
 * publish appeared to be missing entirely. Say the plain thing.
 */
function statusLabel(from: string, to: string) {
	if (to === "active") return "Publish";
	if (to === "archived") return "Archive";
	return from === "archived" ? "Restore" : "Unpublish";
}

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

function draftFrom(item: CatalogItem): ProductDraft {
	return {
		name: item.name,
		description: item.description ?? "",
		type: item.type,
		sku: item.sku ?? "",
		pricingModel: item.pricingModel,
		price: fromCents(item.priceCents),
		compareAt: fromCents(
			typeof item.metadata.compareAtPriceCents === "number"
				? item.metadata.compareAtPriceCents
				: null,
		),
		currency: item.currency,
		unitLabel: item.unitLabel ?? "",
		weightGrams: item.weightGrams == null ? "" : String(item.weightGrams),
		slug: metaText(item.metadata, "slug"),
		shortDescription: metaText(item.metadata, "shortDescription"),
		tags: metaTags(item.metadata).join(", "),
		featured: metaFlag(item.metadata, "featured"),
	};
}

export function ProductPanel({
	workspaceId,
	item,
	onClose,
}: {
	workspaceId: string;
	item: CatalogItem;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const fileInput = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [held, setHeld] = useState<number | null>(null);
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * This stored a string, so everything the failure knew — its status, its
	 * request id — was thrown away at the moment it arrived, and a 500 printed
	 * a raw `HTTP 500` into the footer. `fallback` survives because the
	 * per-action wording ("that upload did not work") is better than anything a
	 * generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [draft, setDraft] = useState<ProductDraft>(() => draftFrom(item));
	const images = imagesOf(item.metadata);

	// Switching to another product must load that product, not keep editing the
	// last one's text in a form now labelled with a different name.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on identity, not on every field
	useEffect(() => {
		setDraft(draftFrom(item));
		setFailure(null);
		// An armed Delete must not carry over to a different product.
		setConfirming(false);
	}, [item.id]);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "catalog"],
		});

	/**
	 * Where this product is filed, and everywhere it could be.
	 *
	 * ⚠️ `includeHidden` because this is the operator's view. A category the shop
	 * has hidden still contains items, and leaving it out of this list would make
	 * it impossible to take a product back out of one.
	 */
	const categories = useQuery({
		queryKey: ["quickdash", workspaceId, "categories", "all"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					items: Array<{ id: string; name: string; kind: string }>;
				}>("/categories?includeHidden=true")
			).data,
	});

	const membership = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog", item.id, "categories"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ categoryIds: string[] }>(
					`/catalog/${item.id}/categories`,
				)
			).data,
	});

	const setCategories = useMutation({
		mutationFn: async (categoryIds: string[]) => {
			await workspaceApi(workspaceId).request(
				`/catalog/${item.id}/categories`,
				{ method: "PUT", body: { categoryIds } },
			);
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That category change did not save.",
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "catalog", item.id, "categories"],
			}),
	});

	const filedUnder = membership.data?.categoryIds ?? [];
	const toggleCategory = (id: string) =>
		setCategories.mutate(
			filedUnder.includes(id)
				? filedUnder.filter((entry) => entry !== id)
				: [...filedUnder, id],
		);

	const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }));

	const online = useOnline();
	const save = useMutation({
		mutationFn: async () => {
			const priced = wantsPrice(draft.pricingModel);
			const compareAtCents = toCents(draft.compareAt);
			/**
			 * 🔴 Tolerant of the unit the hint asks for. The field says "grams", so
			 * people type "340g" — and `Number("340g")` is NaN, which the guard
			 * below turns into null. The weight was then silently discarded and the
			 * product shipped unweighable, with nothing on screen to say so.
			 *
			 * Rounded because grams are whole. Negative and zero are refused by the
			 * `weight > 0` guard where this is sent, so a weight is either a real
			 * positive number of grams or it is absent.
			 */
			const parsedWeight = parseAmount(draft.weightGrams);
			const weight = parsedWeight === null ? null : Math.round(parsedWeight);

			/**
			 * 🔴 METADATA IS REPLACED, NOT MERGED, BY THE API.
			 *
			 * `catalogItemPatchSchema` takes `metadata` as a whole record, and the
			 * item's PHOTOGRAPHS live in `metadata.images`. Sending only the fields
			 * this form edits would silently delete every image on the product —
			 * the single most destructive thing this panel could do, and it would
			 * look like a successful save. So the existing metadata is spread first
			 * and only the keys this form owns are overwritten.
			 */
			const metadata: Record<string, unknown> = {
				...item.metadata,
				slug: draft.slug.trim() || undefined,
				shortDescription: draft.shortDescription.trim() || undefined,
				tags: draft.tags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
				featured: draft.featured,
				compareAtPriceCents: compareAtCents ?? undefined,
			};
			// Undefined keys would serialise away anyway; deleting them keeps the
			// stored record clean rather than accumulating empty strings.
			for (const key of Object.keys(metadata)) {
				if (metadata[key] === undefined) delete metadata[key];
			}

			await workspaceApi(workspaceId).request(`/catalog/${item.id}`, {
				method: "PATCH",
				/**
				 * 🔴 Required, not optional. Catalog writes go through
				 * `mutationContext`, which refuses a mutation with no
				 * `Idempotency-Key` — the API answers "An Idempotency-Key header is
				 * required for this operation" and nothing saves.
				 *
				 * A FRESH key per attempt, deliberately. The key identifies one
				 * intent, and each Save is a new one carrying possibly different
				 * values; reusing a stable key would have the second save rejected
				 * as a replay with mismatched input.
				 */
				idempotencyKey: crypto.randomUUID(),
				body: {
					name: draft.name.trim(),
					description: draft.description.trim() || null,
					type: draft.type,
					sku: draft.sku.trim() || null,
					pricingModel: draft.pricingModel,
					// 🔑 Null when the model forbids a price, or the API rejects the
					// whole save with a message about a field the form is not showing.
					priceCents: priced ? toCents(draft.price) : null,
					currency: draft.currency.trim().toUpperCase(),
					unitLabel: draft.unitLabel.trim() || null,
					weightGrams:
						weight && Number.isFinite(weight) && weight > 0 ? weight : null,
					metadata,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That did not save." }),
		onSuccess: refresh,
	});

	/**
	 * Two presses, not a browser confirm dialog.
	 *
	 * A `window.confirm` blocks the whole page and reads as the app breaking;
	 * the button asking "Delete for good?" and waiting keeps the question next
	 * to the thing it is about. Blurring cancels, so it cannot be left armed.
	 */
	const remove = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request(`/catalog/${item.id}`, {
				method: "DELETE",
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) => {
			setConfirming(false);
			setFailure({ error: error, fallback: "That could not be deleted." });
		},
		onSuccess: async () => {
			await refresh();
			// The record is gone, so the panel has nothing left to show.
			onClose();
		},
	});

	const setStatus = useMutation({
		mutationFn: async (status: string) => {
			await workspaceApi(workspaceId).request(`/catalog/${item.id}/status`, {
				method: "POST",
				idempotencyKey: crypto.randomUUID(),
				body: { status },
			});
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That status change did not save.",
			}),
		onSuccess: refresh,
	});

	// 🔑 Kept separately from the panel-wide `failure`, which renders in the
	// footer — a scrolling panel can put that off screen entirely, so an upload
	// that failed looked exactly like one that did nothing.
	const [uploadFailure, _setUploadFailure] = useState<string | null>(null);

	const upload = useMutation({
		mutationFn: async (files: File[]) => {
			// A mutation that quietly does nothing is indistinguishable from one
			// that worked. Refuse instead, so the next version of this bug is loud.
			if (files.length === 0) throw new Error("No file was selected.");
			// Sequential rather than parallel: each upload rewrites the same item's
			// metadata, so concurrent writes would race and the last one would win
			// with a stale list.
			for (const file of Array.from(files)) {
				const form = new FormData();
				form.set("file", file);
				await workspaceApi(workspaceId).request(
					`/quickdash/catalog/${item.id}/images`,
					{
						method: "POST",
						// 🔴 The upload writes the image list back through
						// `catalog-items.update`, which is a `mutationContext` commit and
						// refuses a missing `Idempotency-Key` — so an upload with no key
						// stores the file and then fails to record it.
						idempotencyKey: crypto.randomUUID(),
						body: form,
					},
				);
			}
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That upload did not work." }),
		onSuccess: refresh,
	});

	const setImages = useMutation({
		mutationFn: async (next: string[]) => {
			await workspaceApi(workspaceId).request(
				`/quickdash/catalog/${item.id}/images`,
				{
					method: "PUT",
					idempotencyKey: crypto.randomUUID(),
					body: { images: next },
				},
			);
		},
		onSuccess: refresh,
	});

	const move = (from: number, to: number) => {
		if (from === to) return;
		const next = [...images];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		setImages.mutate(next);
	};

	const priced = wantsPrice(draft.pricingModel);
	// A price the model requires but the form does not have is the one thing the
	// API will certainly refuse, so Save says so instead of letting it fail.
	const missingPrice = priced && toCents(draft.price) === null;
	const valid = draft.name.trim().length > 0 && !missingPrice;

	return (
		<aside className={detailCard}>
			<header className="flex items-start gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12.5px] text-[var(--ink-85)]">
						{item.name}
					</p>
					<p className="text-[11px] text-[var(--ink-30)]">
						{money(item.priceCents, item.currency)}
						<span className="text-[var(--ink-20)]"> · {item.status}</span>
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

			{/* 🔴 Under the header, not beside Save.
			    On the footer row it competed with the one control you want
			    pressed, got clipped by the panel's width, and sat at the bottom
			    of a long form — so a save could fail with its own message
			    scrolled off screen. Here it is the first thing read on the way
			    back to the fields, which is where the problem is. */}
			{failure ? (
				<div className="shrink-0 px-4 pt-3">
					<WriteFailure error={failure.error} message={failure.fallback} />
				</div>
			) : null}

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{/* The lifecycle moves that are NOT publishing. Publish lives in the
				    footer beside Save; showing it here as well would put the same
				    action on screen twice and make one of them look like something
				    else. */}
				<div className="mb-3 flex flex-wrap items-center gap-1.5">
					{(NEXT_STATUSES[item.status] ?? [])
						.filter((status) => status !== "active")
						.map((status) => (
							<button
								key={status}
								type="button"
								className={quiet}
								disabled={setStatus.isPending}
								onClick={() => setStatus.mutate(status)}
							>
								{statusLabel(item.status, status)}
							</button>
						))}

					{/* 🔴 Only once ARCHIVED, because that is the only point the API will
					    accept it — `deleteCatalogItem` throws `CATALOG_ITEM_MUST_BE_ARCHIVED`
					    otherwise. Offering Delete on a live product would be a button that
					    always fails.

					    Deleting is safe for history: `order_line_items` keeps its own copy
					    of the name, SKU and price as sold, and the link back to the catalog
					    is nullable, so past orders still read correctly. What is lost is
					    the product itself, which is why archiving is the everyday action
					    and this is the rare one. */}
					{item.status === "archived" ? (
						<button
							type="button"
							className={`${quiet} ml-auto border-[rgb(255_107_107/0.35)] text-[var(--signal-failure-text)] hover:text-[var(--signal-failure-text)]`}
							disabled={remove.isPending}
							onClick={() => {
								if (confirming) remove.mutate();
								else setConfirming(true);
							}}
							onBlur={() => setConfirming(false)}
						>
							{remove.isPending
								? "Deleting…"
								: confirming
									? "Delete for good?"
									: "Delete"}
						</button>
					) : null}
				</div>

				<div className="space-y-3">
					<Text
						label="Name"
						value={draft.name}
						onChange={(value) => set("name", value)}
						placeholder="What a shopper sees"
					/>
					<Choice
						label="Type"
						options={CATALOG_ITEM_TYPES}
						value={draft.type}
						onChange={(value) => set("type", value)}
					/>
					<Area
						label="Description"
						hint="shown on the product page"
						value={draft.description}
						onChange={(value) => set("description", value)}
					/>
				</div>

				<Section title="Pricing" open>
					<Choice
						label="Pricing model"
						options={PRICING_MODELS}
						value={draft.pricingModel}
						onChange={(value) => set("pricingModel", value)}
					/>
					{priced ? (
						<div className="grid grid-cols-2 gap-2">
							<Text
								label="Price"
								value={draft.price}
								onChange={(value) => set("price", value)}
								placeholder="12.00"
								inputMode="decimal"
							/>
							<Text
								label="Compare at"
								hint="struck through"
								value={draft.compareAt}
								onChange={(value) => set("compareAt", value)}
								placeholder="18.00"
								inputMode="decimal"
							/>
						</div>
					) : (
						<p className="text-[11px] text-[var(--ink-30)]">
							{draft.pricingModel === "free"
								? "Free items carry no price."
								: "A quoted item is priced per enquiry, so it carries no price here."}
						</p>
					)}
					<div className="grid grid-cols-2 gap-2">
						<Text
							label="Currency"
							value={draft.currency}
							onChange={(value) => set("currency", value.toUpperCase())}
							placeholder="CAD"
						/>
						<Text
							label="Unit"
							hint="per what"
							value={draft.unitLabel}
							onChange={(value) => set("unitLabel", value)}
							placeholder="unit, hour"
						/>
					</div>
				</Section>

				<Section title="Shipping">
					<Text
						label="Weight"
						hint="grams, used to quote delivery"
						value={draft.weightGrams}
						onChange={(value) => set("weightGrams", value)}
						placeholder="480"
						inputMode="decimal"
					/>
					<Text
						label="SKU"
						hint="your own code"
						value={draft.sku}
						onChange={(value) => set("sku", value)}
						placeholder="KA-K2-BLK"
					/>
				</Section>

				<Section title="Categories" open>
					{/* 🔑 Saved on click rather than with the rest of the form. Filing is
					    a different kind of act from editing a description — it is how a
					    shopper finds the thing — and making it wait behind Save is how
					    somebody assigns a category, closes the panel and loses it. */}
					{categories.isError ? (
						<BlockFailure query={categories} />
					) : categories.isPending ? (
						<p className="text-[11px] text-[var(--ink-30)]">Loading…</p>
					) : (categories.data?.items.length ?? 0) === 0 ? (
						<p className="text-[11px] text-[var(--ink-30)]">
							No categories yet. Create one and shoppers can browse by it.
						</p>
					) : (
						<div className="flex flex-wrap gap-1">
							{(categories.data?.items ?? []).map((category) => {
								const on = filedUnder.includes(category.id);
								return (
									<button
										key={category.id}
										type="button"
										disabled={setCategories.isPending || membership.isPending}
										onClick={() => toggleCategory(category.id)}
										className={`h-7 rounded-full px-2.5 text-[11px] transition-colors disabled:opacity-40 ${
											on
												? "bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
												: "border border-[var(--console-line-strong)] text-[var(--ink-50)] hover:text-[var(--ink-85)]"
										}`}
									>
										{category.name}
									</button>
								);
							})}
						</div>
					)}
				</Section>

				<Section title="Storefront">
					<Text
						label="Web address"
						hint="the last part of the link"
						value={draft.slug}
						onChange={(value) => set("slug", value)}
						placeholder="k2-studio-monitor"
					/>
					<Area
						label="Short description"
						hint="listings and previews"
						rows={2}
						value={draft.shortDescription}
						onChange={(value) => set("shortDescription", value)}
					/>
					<Text
						label="Tags"
						hint="comma separated"
						value={draft.tags}
						onChange={(value) => set("tags", value)}
						placeholder="studio, monitor"
					/>
					<Toggle
						label="Feature this"
						hint="shops usually show these first"
						value={draft.featured}
						onChange={(value) => set("featured", value)}
					/>
				</Section>

				<Section title="Photographs" open>
					{images.length > 1 ? (
						<p className="text-[11px] text-[var(--ink-30)]">
							Drag to reorder. The first is shown in listings.
						</p>
					) : null}

					{images.length > 0 ? (
						<div className="grid grid-cols-3 gap-2">
							{images.map((url, index) => (
								// The drag target holds its own controls so it cannot be a button;
								// "Make first" is the keyboard equivalent of the drag.
								// biome-ignore lint/a11y/noStaticElementInteractions: drag reorder container
								<div
									key={url}
									draggable
									onDragStart={() => setHeld(index)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={() => {
										if (held !== null) move(held, index);
										setHeld(null);
									}}
									className={`group relative overflow-hidden rounded-lg border ${
										index === 0
											? "border-[rgb(var(--console-ink)/0.35)]"
											: "border-[var(--console-line-soft)]"
									} ${held === index ? "opacity-40" : ""}`}
								>
									<img
										src={url}
										alt=""
										className="aspect-square w-full object-cover"
									/>
									{index > 0 ? (
										<button
											type="button"
											onClick={() => move(index, 0)}
											className="absolute bottom-1 left-1 rounded-full bg-[rgb(0_0_0/0.6)] px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
										>
											Make first
										</button>
									) : null}
									<button
										type="button"
										onClick={() =>
											setImages.mutate(images.filter((entry) => entry !== url))
										}
										className="absolute top-1 right-1 rounded-full bg-[rgb(0_0_0/0.6)] px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
									>
										Remove
									</button>
								</div>
							))}
						</div>
					) : null}

					{/* A drop target that is also a button, because half of people will
					    drag and half will click, and neither should have to discover
					    the other. */}
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
							// Snapshotted for the same reason as the picker: the mutation
							// body runs after this handler returns, and `dataTransfer` is
							// not guaranteed to still be readable by then.
							const files = Array.from(event.dataTransfer.files);
							if (files.length > 0) upload.mutate(files);
						}}
						className={`${upload.isPending ? "shimmer-busy" : ""} flex h-24 w-full items-center justify-center rounded-xl border border-dashed text-[11.5px] transition-colors ${
							dragging
								? "border-[rgb(var(--console-ink)/0.4)] bg-[rgb(var(--console-ink)/0.05)] text-[var(--ink-85)]"
								: "border-[var(--console-line-strong)] text-[var(--ink-30)] hover:text-[var(--ink-60)]"
						}`}
					>
						{upload.isPending
							? "Uploading…"
							: "Drop images here, or click to pick"}
					</button>
					{uploadFailure ? <WriteFailure message={uploadFailure} /> : null}

					<input
						ref={fileInput}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(event) => {
							/**
							 * 🔴 SNAPSHOT FIRST. `FileList` is LIVE — it is a view onto the
							 * input, not a copy — so clearing `value` empties the list the
							 * mutation is about to read.
							 *
							 * The old order called `mutate(files)` and then cleared, and
							 * because the mutation body runs asynchronously it always saw
							 * zero files: the upload loop never ran, no request was made,
							 * and the mutation RESOLVED SUCCESSFULLY. The spinner appeared,
							 * the list refetched, no error showed and nothing was ever
							 * stored — the exact symptom of "image upload does nothing",
							 * and invisible in the API log because there was no request to
							 * log.
							 *
							 * Clearing is still required, or picking the same file twice in
							 * a row fires no `change` event at all.
							 */
							const files = Array.from(event.target.files ?? []);
							event.target.value = "";
							if (files.length > 0) upload.mutate(files);
						}}
					/>
				</Section>
			</div>

			<footer className="shrink-0 border-[var(--console-line-soft)] border-t px-4 py-3">
				{missingPrice ? (
					<p className="mb-2 text-[11.5px] text-[var(--signal-attention-text)]">
						{draft.pricingModel.replace(/_/g, " ")} pricing needs a price.
					</p>
				) : null}
				{/* 🔑 Publish sits WITH Save, not buried at the top of a scrolling
				    panel. Saving and publishing are the two ways of being finished,
				    and separating them made the second look absent — the panel
				    appeared to only be able to keep drafts. */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={save.isPending || !online || !valid}
						onClick={() => save.mutate()}
						className={`${save.isPending ? "shimmer-busy" : ""} inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
					>
						{!online
							? "Waiting for a connection…"
							: save.isPending
								? "Saving…"
								: "Save"}
					</button>

					{/* Publishing is a separate commit from saving fields, because the
					    API models it as one — a status transition with its own legal
					    moves, not a column on the form. */}
					{(NEXT_STATUSES[item.status] ?? []).includes("active") ? (
						<button
							type="button"
							disabled={setStatus.isPending}
							onClick={() => setStatus.mutate("active")}
							className={`${setStatus.isPending ? "shimmer-busy" : ""} inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-85)] transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] disabled:opacity-40`}
						>
							{setStatus.isPending ? "Publishing…" : "Publish"}
						</button>
					) : null}
				</div>
			</footer>
		</aside>
	);
}
