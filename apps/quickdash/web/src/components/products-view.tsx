import {
	FunnelIcon,
	type Icon,
	ImageIcon,
	MagnifyingGlassIcon,
	RowsIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { workspaceApi } from "../lib/api";

/** The page's one create action. Filled pill, ink on the popover surface. */
const addAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85";

const chip =
	"rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]";

const VIEWS: Array<{ id: "cards" | "table"; Glyph: Icon }> = [
	{ id: "cards", Glyph: SquaresFourIcon },
	{ id: "table", Glyph: RowsIcon },
];

const STATUSES = ["active", "draft", "archived"] as const;

type CatalogItem = {
	id: string;
	name: string;
	description: string | null;
	status: string;
	priceCents: number | null;
	currency: string;
	metadata: Record<string, unknown>;
};

const money = (cents: number | null, currency: string) =>
	cents == null
		? "No price"
		: new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: currency || "USD",
			}).format(cents / 100);

/**
 * The images an item has, read from the same metadata key the storefront reads.
 *
 * 🔑 Deliberately the SAME contract as a customer's own website rather than a
 * QuickDash-private field: what an operator sees here is exactly what a shopper
 * will see, which is the only way this page can be trusted.
 */
const imagesOf = (metadata: Record<string, unknown>) =>
	Array.isArray(metadata.images)
		? metadata.images.filter((url): url is string => typeof url === "string")
		: [];

/** A struck-through original, when the item is selling below it. */
const compareAt = (metadata: Record<string, unknown>) =>
	typeof metadata.compareAtPriceCents === "number"
		? metadata.compareAtPriceCents
		: null;

function Thumb({ item, size }: { item: CatalogItem; size: "sm" | "lg" }) {
	const [broken, setBroken] = useState(false);
	const url = imagesOf(item.metadata)[0];
	const box =
		size === "lg"
			? "aspect-[4/3] w-full rounded-lg"
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
function ImagePanel({
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
	const [failure, setFailure] = useState<string | null>(null);
	const images = imagesOf(item.metadata);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "catalog"],
		});

	const upload = useMutation({
		mutationFn: async (files: FileList | File[]) => {
			// Sequential rather than parallel: each upload rewrites the same item's
			// metadata, so concurrent writes would race and the last one would win
			// with a stale list.
			for (const file of Array.from(files)) {
				const form = new FormData();
				form.set("file", file);
				await workspaceApi(workspaceId).request(
					`/quickdash/catalog/${item.id}/images`,
					{ method: "POST", body: form },
				);
			}
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That upload did not work."),
		onSuccess: refresh,
	});

	const setImages = useMutation({
		mutationFn: async (next: string[]) => {
			await workspaceApi(workspaceId).request(
				`/quickdash/catalog/${item.id}/images`,
				{ method: "PUT", body: { images: next } },
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

	return (
		<aside className="fixed inset-y-0 right-0 z-30 flex w-[26rem] max-w-full flex-col border-[var(--console-line-strong)] border-l bg-[var(--console-panel)]">
			<header className="flex items-start gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12.5px] text-[var(--ink-85)]">
						{item.name}
					</p>
					<p className="text-[11px] text-[var(--ink-30)]">
						{money(item.priceCents, item.currency)}
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

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				<p className="mb-2 text-[11px] text-[var(--ink-45)]">
					Photographs
					{images.length > 1 ? (
						<span className="text-[var(--ink-30)]">
							{" "}
							· drag to reorder, first is shown in listings
						</span>
					) : null}
				</p>

				{images.length > 0 ? (
					<div className="mb-3 grid grid-cols-3 gap-2">
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

				{/* A drop target that is also a button, because half of people will drag
				    and half will click, and neither should have to discover the other. */}
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
						if (event.dataTransfer.files.length) {
							upload.mutate(event.dataTransfer.files);
						}
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
				<input
					ref={fileInput}
					type="file"
					accept="image/*"
					multiple
					hidden
					onChange={(event) => {
						if (event.target.files?.length) upload.mutate(event.target.files);
						event.target.value = "";
					}}
				/>

				{failure ? (
					<p className="mt-2 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
				) : null}
			</div>
		</aside>
	);
}

export function ProductsView({ workspaceId }: { workspaceId: string }) {
	const [query, setQuery] = useState("");
	const [view, setView] = useState<"cards" | "table">("cards");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const catalog = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog"],
		queryFn: async () =>
			(await workspaceApi(workspaceId).catalog.list({ limit: 100 })).data,
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

	const withoutImages = ((catalog.data?.items ?? []) as CatalogItem[]).filter(
		(item) => imagesOf(item.metadata).length === 0,
	).length;

	// Resolved from the live list rather than held as its own copy, so an upload
	// shows in the panel the moment the query refetches.
	const selected =
		((catalog.data?.items ?? []) as CatalogItem[]).find(
			(item) => item.id === selectedId,
		) ?? null;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
					<MagnifyingGlassIcon
						size={14}
						className="shrink-0 text-[var(--ink-30)]"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search products"
						className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				</div>

				<Popover>
					<PopoverAnchor asChild>
						<div className="flex shrink-0 items-center gap-2">
							<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 text-[12.5px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)] focus-visible:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:text-[var(--ink-85)]">
								<FunnelIcon size={14} />
								Filter
								{statuses.length > 0 ? (
									<span className={chip}>{statuses.length}</span>
								) : null}
							</PopoverTrigger>

							<button
								type="button"
								role="switch"
								aria-checked={view === "table"}
								aria-label={`View: ${view === "table" ? "table" : "cards"}. Switch to ${view === "table" ? "cards" : "table"}.`}
								onClick={() => setView(view === "cards" ? "table" : "cards")}
								className="relative flex h-9 w-[4.25rem] shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.1)] focus-visible:bg-[rgb(var(--console-ink)/0.1)]"
							>
								<span
									aria-hidden="true"
									className={`absolute top-0.5 left-0.5 size-8 rounded-full bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${
										view === "table" ? "translate-x-8" : "translate-x-0"
									}`}
								/>
								{VIEWS.map(({ id, Glyph }) => (
									<span
										key={id}
										className={`relative z-10 flex size-8 items-center justify-center transition-colors ${
											view === id
												? "text-[var(--ink-90)]"
												: "text-[var(--ink-30)]"
										}`}
									>
										<Glyph size={15} />
									</span>
								))}
							</button>

							<button type="button" className={addAction}>
								New product
							</button>
						</div>
					</PopoverAnchor>

					<PopoverContent
						align="start"
						sideOffset={8}
						className="w-[var(--radix-popover-trigger-width)] rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-3"
					>
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
					</PopoverContent>
				</Popover>
			</div>

			{/* Says the one thing an operator most needs to act on, without becoming a
			    banner that has to be dismissed. */}
			{withoutImages > 0 ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
					{withoutImages} of {catalog.data?.items.length} have no photograph.
				</p>
			) : null}

			{catalog.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Loading products…</p>
			) : catalog.isError ? (
				<p className="text-[12px] text-[var(--ink-45)]">
					Products did not load.
				</p>
			) : items.length === 0 ? (
				<p className="text-[12px] text-[var(--ink-30)]">
					{query || statuses.length ? "Nothing matches." : "No products yet."}
				</p>
			) : view === "cards" ? (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
					{items.map((item) => {
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
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{items.map((item) => {
						const original = compareAt(item.metadata);
						return (
							<button
								type="button"
								key={item.id}
								onClick={() => setSelectedId(item.id)}
								className={`flex w-full items-center gap-3 py-2 text-left transition-colors ${
									selectedId === item.id ? "opacity-100" : "hover:opacity-80"
								}`}
							>
								<Thumb item={item} size="sm" />
								<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
									{item.name}
								</p>
								{item.status !== "active" ? (
									<span className={`${chip} capitalize`}>{item.status}</span>
								) : null}
								{original != null && original !== item.priceCents ? (
									<span className="text-[11px] text-[var(--ink-30)] line-through">
										{money(original, item.currency)}
									</span>
								) : null}
								<span className="w-24 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
									{money(item.priceCents, item.currency)}
								</span>
							</button>
						);
					})}
				</div>
			)}

			{selected ? (
				<ImagePanel
					workspaceId={workspaceId}
					item={selected}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
