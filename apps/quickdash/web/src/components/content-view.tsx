import { MagnifyingGlassIcon, MonitorIcon } from "@phosphor-icons/react";
import { useConsoleFocus } from "@quickengine/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { workspaceApi } from "../lib/api";
import { ContentPreview } from "./content-preview";
import { ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";

/**
 * Content — the words on a business's own website.
 *
 * 🔴 Named slots, NOT pages. A developer declares which parts of a site are
 * editable; the operator fills them in. That boundary is the whole design: the
 * owner can rewrite every word and cannot break the layout, because layout was
 * never theirs to touch. See `internal/planning/CONTENT_MODULE.md`.
 *
 * 🔴 Published is what a site actually serves. A draft is something the business
 * has deliberately not said yet, so it is edited here and stays invisible until
 * somebody publishes it — a half-written About section must never appear
 * mid-sentence on a live page.
 *
 * ⚠️ A `list` slot holds an ordered array — FAQ entries, testimonials. Until the
 * manifest can declare the fields of a list item, those are edited as JSON. That
 * is honest rather than pretty, and it is recorded as the next backend change.
 */

type ContentEntry = {
	key: string;
	type: string;
	kind: "single" | "list";
	value: unknown;
	published: boolean;
	label: string | null;
	description: string | null;
	group: string | null;
};

const solid =
	"inline-flex h-7 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-2.5 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** What a slot holds, as text somebody can edit. */
const asText = (entry: ContentEntry) => {
	// A gallery is never edited as text, so it has no text form. Returning its
	// JSON here would put `["http://…"]` into the single-image `<img src>` below.
	if (isGallery(entry)) return "";
	if (entry.kind === "list" || entry.type === "json") {
		return JSON.stringify(entry.value ?? [], null, 2);
	}
	return typeof entry.value === "string"
		? entry.value
		: String(entry.value ?? "");
};

/**
 * A slot holding MANY pictures — `type: "image"` with `kind: "list"`.
 *
 * 🔴 This is what "three backdrop slots" should always have been. Fixed numbered
 * slots mean the number of pictures a site can show is decided by whoever wrote
 * the code, and adding a fourth is a deploy.
 *
 * ⚠️ `kind: "list"` already existed and rendered as a JSON TEXTAREA, so a gallery
 * meant the shop owner hand-writing `["https://…", "https://…"]` — which is not
 * something anybody can be asked to do, and is exactly why Gemsutopia's hero
 * images have sat empty. The shape was right; only the control was missing.
 */
const isGallery = (entry: ContentEntry) =>
	entry.type === "image" && entry.kind === "list";

/** The pictures in a gallery slot, ignoring anything that is not a URL. */
const galleryUrls = (entry: ContentEntry): string[] =>
	Array.isArray(entry.value)
		? entry.value.filter(
				(item): item is string => typeof item === "string" && item !== "",
			)
		: [];

/** A one-line preview, so a long page of slots stays scannable. */
const preview = (entry: ContentEntry) => {
	if (isGallery(entry)) {
		const count = galleryUrls(entry).length;
		return count === 0
			? "No pictures yet"
			: `${count} ${count === 1 ? "picture" : "pictures"}`;
	}
	if (entry.kind === "list") {
		const count = Array.isArray(entry.value) ? entry.value.length : 0;
		return `${count} ${count === 1 ? "entry" : "entries"}`;
	}
	const text = asText(entry).replace(/\s+/g, " ").trim();
	return text.length > 90 ? `${text.slice(0, 90)}…` : text || "Empty";
};

/**
 * Search that finds a slot by any part of its name.
 *
 * 🔴 A key like `returns:policy` is a DEVELOPER's name for a slot, and nobody
 * running a shop is going to remember the punctuation. Substring matching on the
 * raw key means "returns policy" finds nothing, because that exact string does
 * not appear anywhere — the colon is in the way.
 *
 * 🔑 Both sides are broken into words on any punctuation, and every word typed
 * has to appear somewhere. So `returns`, `policy`, `returns policy` and
 * `policy returns` all find `returns:policy`, and typing more words narrows
 * rather than suddenly matching nothing.
 *
 * ⚠️ Matches the GROUP too. On a site whose slots have real labels, "home" is
 * how somebody asks for everything on the home page.
 */
const searchTerms = (search: string): string[] =>
	search
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

const matchesSearch = (entry: ContentEntry, terms: string[]): boolean => {
	if (terms.length === 0) return true;
	const haystack = [
		entry.key,
		entry.label ?? "",
		entry.group ?? "",
		// A gallery has no text form, so its pictures contribute nothing to a
		// search — its label and group are what somebody can actually search for.
		asText(entry),
	]
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ");
	return terms.every((term) => haystack.includes(term));
};

export function ContentView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [draftsOnly, setDraftsOnly] = useState(false);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	/**
	 * Whether the customer's site is shown beside the words.
	 *
	 * ⚠️ Remembered per browser rather than per workspace record. It is a way of
	 * working, not a property of the business — and a second person opening the
	 * same shop should not have their layout changed by a choice somebody else
	 * made.
	 */
	const [previewOpen, setPreviewOpen] = useState<boolean>(() => {
		try {
			return window.localStorage.getItem("quickdash:content-preview") === "on";
		} catch {
			return false;
		}
	});
	const togglePreview = () => {
		setPreviewOpen((was) => {
			const next = !was;
			try {
				window.localStorage.setItem(
					"quickdash:content-preview",
					next ? "on" : "off",
				);
			} catch {}
			return next;
		});
	};

	/**
	 * 🔑 Bumped after every successful write, which is what re-fetches the framed
	 * page. A cross-origin frame cannot be told to reload, so the reload has to
	 * come from its `src` changing.
	 */
	const [reloadToken, setReloadToken] = useState(0);

	/**
	 * How wide the editing rail is — and therefore how narrow the PAGE is.
	 *
	 * 🔴 Dragging this is the responsive test. A shop owner has no other way to
	 * see what their site does at phone width without opening developer tools,
	 * and the preview was landing just wide enough to sit on the edge of a mobile
	 * breakpoint with no way to push it either side.
	 *
	 * 🔑 The rail grows and the page shrinks, so the same gesture that makes the
	 * editor comfortable also narrows the page — one control, two useful effects.
	 */
	const RAIL_MIN = 240;
	/**
	 * 🔴 The limit belongs to the PAGE, not the rail.
	 *
	 * A fixed maximum rail width meant that on a wide monitor the page never got
	 * below about a thousand pixels — so the preview could show desktop and
	 * tablet and simply could not reach a phone, which is the width most people
	 * actually browse at.
	 *
	 * Capping how narrow the PAGE may get instead means the rail can grow as far
	 * as the screen allows, and the range always ends at a phone.
	 */
	const PAGE_MIN = 320;
	const railMax = () => Math.max(RAIL_MIN, window.innerWidth - PAGE_MIN);

	/** Set the rail so the PAGE lands at a given width. */
	const setPageWidth = (pageWidth: number | null) => {
		if (pageWidth === null) {
			setRailWidth(RAIL_MIN);
			return;
		}
		setRailWidth(
			Math.min(railMax(), Math.max(RAIL_MIN, window.innerWidth - pageWidth)),
		);
	};
	const [railWidth, setRailWidth] = useState<number>(() => {
		try {
			const stored = Number(
				window.localStorage.getItem("quickdash:content-rail"),
			);
			// ⚠️ Clamped against THIS screen: a width saved on a large monitor
			// would otherwise leave no page at all on a laptop.
			return stored >= RAIL_MIN && stored <= window.innerWidth - 320
				? stored
				: RAIL_MIN;
		} catch {
			return RAIL_MIN;
		}
	});
	const [dragging, setDragging] = useState(false);

	/**
	 * 🔑 The preview takes the WHOLE console, navigation included.
	 *
	 * Beside the left navigation the page was squeezed between two columns of
	 * chrome, which is the opposite of what a preview is for. Focus mode hides
	 * the shell's own furniture for as long as the preview is open and gives it
	 * straight back on exit — so the "Hide site" button is also the way out.
	 *
	 * ⚠️ Released on unmount as well. Navigating away with the preview open would
	 * otherwise leave every other page without navigation and no way to get it
	 * back short of a reload.
	 */
	const { setFocused } = useConsoleFocus();
	useEffect(() => {
		setFocused(previewOpen);
		return () => setFocused(false);
	}, [previewOpen, setFocused]);

	/**
	 * ⚠️ Pointer events on the WINDOW, not the handle.
	 *
	 * A drag that tracks only the handle stops the moment the pointer outruns it,
	 * which happens constantly on a fast drag — the rail sticks and the grab is
	 * silently lost. Listening on the window means the gesture continues wherever
	 * the pointer goes, and ends only when the button is released.
	 */
	useEffect(() => {
		if (!dragging) return;
		const onMove = (event: PointerEvent) => {
			const next = window.innerWidth - event.clientX;
			setRailWidth(
				Math.min(
					Math.max(RAIL_MIN, window.innerWidth - PAGE_MIN),
					Math.max(RAIL_MIN, next),
				),
			);
		};
		const onUp = () => setDragging(false);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		// Stops the page selecting text under a drag, which turns the whole
		// console blue while resizing.
		const previousSelect = document.body.style.userSelect;
		document.body.style.userSelect = "none";
		document.body.style.cursor = "col-resize";
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			document.body.style.userSelect = previousSelect;
			document.body.style.cursor = "";
		};
	}, [dragging]);

	useEffect(() => {
		try {
			window.localStorage.setItem("quickdash:content-rail", String(railWidth));
		} catch {}
	}, [railWidth]);

	const content = useQuery({
		queryKey: ["quickdash", workspaceId, "content"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: ContentEntry[] }>(
					"/content/manage/all",
				)
			).data,
	});

	/**
	 * 🔴 A picture that belongs to the WORKSPACE, not to a product.
	 *
	 * The content module has had an `image` slot type since it was written and no
	 * way to fill one, because the only upload in the product attached the file to
	 * a catalog item. So an image slot meant pasting a URL by hand — which is not
	 * something an operator can do, and is why a shop with no products had no way
	 * to put a picture anywhere on its own site.
	 *
	 * ⚠️ Saves the slot in the same action. An upload that succeeds and leaves the
	 * slot empty looks exactly like an upload that failed.
	 */
	const uploadImage = useMutation({
		mutationFn: async (input: { entry: ContentEntry; files: File[] }) => {
			const api = workspaceApi(workspaceId);

			const urls: string[] = [];
			for (const file of input.files) {
				const form = new FormData();
				form.set("file", file);
				const uploaded = await api.request<{ url: string }>(
					"/quickdash/images",
					{ method: "POST", body: form },
				);
				urls.push(uploaded.data.url);
			}

			/**
			 * 🔑 A gallery APPENDS; a single image slot REPLACES.
			 *
			 * ⚠️ Appending to the value read when the page loaded, not to a value
			 * re-read here. Two uploads started before either finished would
			 * otherwise each append to the same stale array and the first would be
			 * lost — so the button is disabled while one is in flight rather than
			 * pretending this is safe to interleave.
			 */
			const value = isGallery(input.entry)
				? [...galleryUrls(input.entry), ...urls]
				: urls[0];

			await api.request(
				`/content/manage/${encodeURIComponent(input.entry.key)}`,
				{
					method: "PUT",
					body: {
						value,
						type: input.entry.type,
						kind: input.entry.kind,
						label: input.entry.label,
						description: input.entry.description,
						group: input.entry.group,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That image could not be uploaded."),
		onSuccess: async () => await refresh(),
	});

	/**
	 * Write a gallery's list back — used by remove and reorder.
	 *
	 * ⚠️ Deliberately separate from `save`. That one parses a textarea and would
	 * need a JSON round-trip for something the interface already holds as an
	 * array, which is a chance to corrupt the shape for no gain.
	 */
	const setGallery = useMutation({
		mutationFn: async (input: { entry: ContentEntry; urls: string[] }) => {
			await workspaceApi(workspaceId).request(
				`/content/manage/${encodeURIComponent(input.entry.key)}`,
				{
					method: "PUT",
					body: {
						value: input.urls,
						type: input.entry.type,
						kind: input.entry.kind,
						label: input.entry.label,
						description: input.entry.description,
						group: input.entry.group,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change could not be saved."),
		onSuccess: async () => await refresh(),
	});

	/**
	 * Empty a slot — which is BOTH "remove this picture" and "put the original
	 * words back".
	 *
	 * 🔑 One operation, because the site's own shipped copy is the fallback for an
	 * empty slot. Clearing a text slot makes the page render exactly what it
	 * rendered before anybody edited anything, and the next time the site
	 * registers its manifest the stored value is seeded back from the same
	 * declaration. So "reset" needs no history table and cannot restore something
	 * the site no longer has.
	 *
	 * 🔴 The reason this had to exist: publish and unpublish were the only
	 * actions, so a picture put on the site by mistake could be hidden and never
	 * removed, and edited copy could never be got back without somebody knowing
	 * what it used to say.
	 *
	 * ⚠️ Leaves the uploaded FILE in storage — it is still stored and still
	 * metered. Deleting the file needs the asset index that Media is waiting on,
	 * because nothing today can tell whether another slot or a product is using
	 * the same picture.
	 */
	const clearSlot = useMutation({
		mutationFn: async (entry: ContentEntry) => {
			await workspaceApi(workspaceId).request(
				`/content/manage/${encodeURIComponent(entry.key)}`,
				{
					method: "PUT",
					body: {
						value: isGallery(entry) ? [] : null,
						type: entry.type,
						kind: entry.kind,
						published: entry.published,
						label: entry.label,
						description: entry.description,
						group: entry.group,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be cleared."),
		onSuccess: async () => await refresh(),
	});

	/**
	 * Re-read the slots, and re-fetch the page beside them.
	 *
	 * 🔴 AWAITED by every mutation that calls it, so a button stays in its
	 * "Uploading…" state until the new picture is actually on screen. Firing the
	 * invalidation and returning immediately let the button finish first — so an
	 * upload looked like it had done nothing, and the only way to see the image
	 * was to reload the console by hand.
	 */
	/**
	 * The published slots, keyed the way the site reads them.
	 *
	 * ⚠️ Derived from the list this page already fetched, so it costs no extra
	 * request and can never disagree with what the editor is showing.
	 */
	const publishedContent = useMemo(() => {
		const map: Record<string, unknown> = {};
		for (const entry of content.data?.items ?? []) {
			if (entry.published) map[entry.key] = entry.value;
		}
		return map;
	}, [content.data]);

	const refresh = async () => {
		// The preview reloads with the list, so the page beside the words is never
		// showing a version of the site older than the words themselves.
		setReloadToken((token) => token + 1);
		await queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "content"],
		});
	};

	const save = useMutation({
		mutationFn: async (input: { entry: ContentEntry; text: string }) => {
			const { entry, text } = input;
			// A list or json slot round-trips through JSON; anything else is the
			// string as typed. Parsing failure is reported rather than silently
			// storing the raw text, which would corrupt the shape the site reads.
			let value: unknown = text;
			if (entry.kind === "list" || entry.type === "json") {
				value = JSON.parse(text);
			}
			await workspaceApi(workspaceId).request(
				`/content/manage/${encodeURIComponent(entry.key)}`,
				{
					method: "PUT",
					body: {
						type: entry.type,
						kind: entry.kind,
						value,
						published: entry.published,
						label: entry.label,
						description: entry.description,
						group: entry.group,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(
				error instanceof SyntaxError
					? "That is not valid JSON, so it was not saved."
					: (error?.message ?? "That did not save."),
			),
		onSuccess: () => {
			setEditing(null);
			refresh();
		},
	});

	const setPublished = useMutation({
		mutationFn: async (input: { keys: string[]; published: boolean }) => {
			await workspaceApi(workspaceId).request("/content/manage/publish", {
				method: "POST",
				body: input,
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: async () => await refresh(),
	});

	/**
	 * 🔴 Two panes side by side, and the EDITOR is the one that narrows.
	 *
	 * The page is what somebody is trying to look at, so it takes the width. The
	 * list of slots keeps a fixed rail wide enough to read a label and a line of
	 * preview text — enough to find the slot, which is all it has to do while the
	 * page is visible.
	 *
	 * ⚠️ Stacked rather than side by side below `lg`. Two columns on a narrow
	 * screen gives a useless page and an unreadable list.
	 */
	/**
	 * 🔴 No filter POPOVER, and a DIFFERENT header in the rail.
	 *
	 * The filter held exactly one checkbox, so opening a popover to reach a single
	 * toggle was two clicks and a layer of chrome for something that fits inline.
	 * Search stays — a site with a hundred slots is found by name, not by
	 * scrolling — but a filter is only worth its button when there is more than
	 * one thing to filter by.
	 *
	 * ⚠️ The shared `ListControls` bar puts search and the actions on ONE row,
	 * which is right at page width and unusable at 240px: the search box collapses
	 * to a few characters and the buttons are cut off. In the rail the same
	 * controls stack instead.
	 */
	const toggles = (
		<>
			<button
				type="button"
				onClick={() => setDraftsOnly(!draftsOnly)}
				aria-pressed={draftsOnly}
				title="Show only slots that are not live yet"
				className={`flex h-9 shrink-0 items-center rounded-full border px-3 text-[12.5px] transition-colors ${
					draftsOnly
						? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
						: "border-[var(--console-line-strong)] text-[var(--ink-50)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)]"
				}`}
			>
				Not published
			</button>
			<button
				type="button"
				onClick={togglePreview}
				aria-pressed={previewOpen}
				className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors ${
					previewOpen
						? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
						: "border-[var(--console-line-strong)] text-[var(--ink-50)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)]"
				}`}
			>
				<MonitorIcon size={14} />
				{previewOpen ? "Hide site" : "Show site"}
			</button>
		</>
	);

	const controls = previewOpen ? (
		<div className="mb-3 flex flex-col gap-2">
			<div className="flex h-9 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
				<MagnifyingGlassIcon
					size={14}
					className="shrink-0 text-[var(--ink-30)]"
				/>
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search content"
					className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
				/>
			</div>
			<div className="flex flex-wrap gap-1.5">{toggles}</div>
		</div>
	) : (
		<ListControls
			query={search}
			onQueryChange={setSearch}
			placeholder="Search content by name or words"
			action={toggles}
		/>
	);

	const editor = (
		<>
			{controls}

			{failure ? <WriteFailure message={failure} /> : null}

			<PageState
				query={content}
				loadingLabel="Loading content…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing to edit yet"
						detail="Your website declares which parts are editable. Once it does, every piece of text appears here for you to change."
					/>
				}
			>
				{(data) => {
					const terms = searchTerms(search);
					const rows = data.items
						.filter((entry) => (draftsOnly ? !entry.published : true))
						.filter((entry) => matchesSearch(entry, terms));

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the filter."
							/>
						);
					}

					// Grouped the way the site's developer grouped them; anything
					// ungrouped falls to the end rather than being hidden.
					const groups = [
						...new Set(rows.map((entry) => entry.group ?? "Other")),
					];

					return (
						<div className="space-y-6">
							{groups.map((group) => (
								<section key={group}>
									<p className="mb-1 text-[11px] text-[var(--ink-45)]">
										{group}
									</p>
									<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
										{rows
											.filter((entry) => (entry.group ?? "Other") === group)
											.map((entry) => {
												const open = editing === entry.key;
												return (
													<div key={entry.key} className="py-2.5">
														{/*
														  🔴 In the rail the row STACKS: name and value on
														  their own line, actions wrapping onto the next.

														  Side by side, a 240px column had to fit a label,
														  a line of preview text and up to three buttons on
														  one row — so the label truncated to a few
														  characters and the buttons were unreadable. Full
														  width, the same row has room for all of it.
														*/}
														<div
															className={`flex flex-wrap items-center ${
																previewOpen ? "gap-x-1.5 gap-y-2" : "gap-3"
															}`}
														>
															<div
																className={`min-w-0 ${
																	previewOpen ? "basis-full" : "flex-1"
																}`}
															>
																<p className="truncate text-[12.5px] text-[var(--ink-85)]">
																	{entry.label ?? entry.key}
																</p>
																{isGallery(entry) &&
																galleryUrls(entry).length > 0 ? (
																	/*
																	  Every picture in the gallery, in order,
																	  with the controls that change that order.
																	  Reordering matters: the first picture is
																	  the one a hero shows before it rotates.
																	*/
																	<div className="mt-1 flex flex-wrap gap-1.5">
																		{galleryUrls(entry).map((url, index) => {
																			const urls = galleryUrls(entry);
																			const move = (to: number) => {
																				const next = [...urls];
																				const [moved] = next.splice(index, 1);
																				next.splice(to, 0, moved);
																				setGallery.mutate({
																					entry,
																					urls: next,
																				});
																			};
																			return (
																				<div
																					key={url}
																					className="group relative"
																				>
																					<img
																						src={url}
																						alt=""
																						className="h-12 w-12 rounded border border-[var(--console-line)] object-cover"
																					/>
																					<div className="absolute inset-0 flex items-center justify-center gap-0.5 rounded bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
																						<button
																							type="button"
																							title="Move earlier"
																							disabled={
																								index === 0 ||
																								setGallery.isPending
																							}
																							className="px-1 text-[13px] text-white disabled:opacity-30"
																							onClick={() => move(index - 1)}
																						>
																							‹
																						</button>
																						<button
																							type="button"
																							title="Remove"
																							disabled={setGallery.isPending}
																							className="px-1 text-[11px] text-white disabled:opacity-30"
																							onClick={() =>
																								setGallery.mutate({
																									entry,
																									urls: urls.filter(
																										(_, at) => at !== index,
																									),
																								})
																							}
																						>
																							✕
																						</button>
																						<button
																							type="button"
																							title="Move later"
																							disabled={
																								index === urls.length - 1 ||
																								setGallery.isPending
																							}
																							className="px-1 text-[13px] text-white disabled:opacity-30"
																							onClick={() => move(index + 1)}
																						>
																							›
																						</button>
																					</div>
																				</div>
																			);
																		})}
																	</div>
																) : entry.type === "image" &&
																	!isGallery(entry) &&
																	asText(entry) ? (
																	<img
																		src={asText(entry)}
																		alt=""
																		className="mt-1 h-12 w-12 rounded border border-[var(--console-line)] object-cover"
																	/>
																) : (
																	<p className="truncate text-[11px] text-[var(--ink-30)]">
																		{entry.type === "image" && !isGallery(entry)
																			? "No image yet"
																			: preview(entry)}
																	</p>
																)}
															</div>

															{!entry.published ? (
																<span className="shrink-0 rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[#f5b44a]">
																	Not published
																</span>
															) : null}

															{/*
															  🔴 An image slot is not edited as text.
															  It shows the picture and takes a file —
															  the one control where a textarea is not a
															  worse version of the right thing, it is
															  useless. Nobody can type a URL for a photo
															  they have on their desktop.
															*/}
															{entry.type === "image" ? (
																<label className={`${quiet} cursor-pointer`}>
																	{uploadImage.isPending &&
																	uploadImage.variables?.entry.key === entry.key
																		? "Uploading…"
																		: isGallery(entry)
																			? "Add pictures"
																			: asText(entry)
																				? "Replace"
																				: "Add image"}
																	<input
																		type="file"
																		accept="image/*"
																		// A gallery takes as many as the owner
																		// wants to choose at once; a single slot
																		// holds exactly one.
																		multiple={isGallery(entry)}
																		className="hidden"
																		disabled={uploadImage.isPending}
																		onChange={(event) => {
																			const files = Array.from(
																				event.target.files ?? [],
																			);
																			// Cleared so choosing the SAME file again
																			// still fires a change event.
																			event.target.value = "";
																			if (files.length > 0)
																				uploadImage.mutate({ entry, files });
																		}}
																	/>
																</label>
															) : (
																<button
																	type="button"
																	className={quiet}
																	onClick={() => {
																		setEditing(open ? null : entry.key);
																		setDraft(asText(entry));
																		setFailure(null);
																	}}
																>
																	{open ? "Cancel" : "Edit"}
																</button>
															)}
															{/*
															  Only offered when there is something to clear. A "Remove"
															  beside an empty slot is a button that does nothing, which
															  reads as broken.
															*/}
															{(
																isGallery(entry)
																	? galleryUrls(entry).length > 0
																	: entry.value !== null &&
																		entry.value !== undefined &&
																		entry.value !== ""
															) ? (
																<button
																	type="button"
																	className={quiet}
																	disabled={rowBusy(clearSlot, entry.key)}
																	title={
																		entry.type === "image"
																			? "Take this off the site"
																			: "Put the site's original wording back"
																	}
																	onClick={() => clearSlot.mutate(entry)}
																>
																	{entry.type === "image" ? "Remove" : "Reset"}
																</button>
															) : null}
															<button
																type="button"
																className={quiet}
																disabled={rowBusy(setPublished, entry.key)}
																onClick={() =>
																	setPublished.mutate({
																		keys: [entry.key],
																		published: !entry.published,
																	})
																}
															>
																{entry.published ? "Unpublish" : "Publish"}
															</button>
														</div>

														{open ? (
															<div className="mt-2">
																<textarea
																	value={draft}
																	onChange={(event) =>
																		setDraft(event.target.value)
																	}
																	rows={entry.kind === "list" ? 12 : 5}
																	className={`w-full resize-y rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 py-2 text-[12.5px] text-[var(--ink-85)] outline-none focus:border-[rgb(var(--console-ink)/0.25)] ${
																		entry.kind === "list" ||
																		entry.type === "json"
																			? "font-mono text-[11.5px]"
																			: ""
																	}`}
																/>
																<div className="mt-2 flex items-center gap-2">
																	<button
																		type="button"
																		className={`${solid} ${save.isPending ? "shimmer-busy" : ""}`}
																		disabled={save.isPending}
																		onClick={() =>
																			save.mutate({ entry, text: draft })
																		}
																	>
																		{save.isPending ? "Saving…" : "Save"}
																	</button>
																	<p className="text-[11px] text-[var(--ink-30)]">
																		{entry.published
																			? "This is live on your site."
																			: "Saved as a draft until you publish it."}
																	</p>
																</div>
															</div>
														) : null}
													</div>
												);
											})}
									</div>
								</section>
							))}
						</div>
					);
				}}
			</PageState>
		</>
	);

	// Preview off: an ordinary page, exactly as every other list in the console.
	if (!previewOpen) {
		return (
			<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
				{editor}
			</main>
		);
	}

	/**
	 * 🔴 Preview on: the SITE is the main screen and the editor is a right rail.
	 *
	 * The first version put the editor on the left at a fixed width and gave the
	 * page whatever was left, which squeezed the page between the console's own
	 * navigation and a column of controls — so the thing somebody opened the
	 * preview to look at was the narrowest part of the screen.
	 *
	 * 🔑 A right rail also matches how the console already reads: navigation on
	 * the left, the subject in the middle, tools on the right.
	 *
	 * ⚠️ `flex-col-reverse` below `lg`: stacked, the page belongs on top and the
	 * controls underneath, which is the same priority the wide layout expresses
	 * horizontally.
	 *
	 * 🔑 `h-full`, not `calc(100dvh - …)`. The shell is `h-svh` with the content
	 * area as a flex child, so this already has a real height to fill — and the
	 * workspace passes `header={null}`, so there is no header bar to subtract.
	 * Subtracting one left a strip of empty background under the page.
	 *
	 * `w-60` matches the navigation on the left exactly, so the console reads as
	 * two rails around a page rather than three different widths.
	 */
	return (
		<div className="flex h-full flex-col-reverse lg:flex-row">
			<div className="relative min-h-0 min-w-0 flex-1 bg-[var(--console-bg)]">
				{/*
				  🔴 A transparent sheet over the page WHILE DRAGGING.

				  An iframe is a separate document, so the moment the pointer crosses
				  into it during a drag, `pointermove` and `pointerup` are delivered
				  THERE and never reach this window. The rail then stops following the
				  pointer, never learns the button was released, and starts tracking
				  plain hover instead — which is exactly how it behaved without this.

				  Covering the frame for the duration of the gesture keeps every event
				  in this document. It is removed the instant the drag ends, so it can
				  never block interaction with the real page.
				*/}
				{dragging ? (
					<div className="absolute inset-0 z-20 cursor-col-resize" />
				) : null}
				<ContentPreview
					workspaceId={workspaceId}
					reloadToken={reloadToken}
					/*
					 * Only while a slot is open. With nothing being edited the page
					 * shows what is actually saved, which is what it should show.
					 */
					draft={editing ? { key: editing, value: draft } : null}
					onChoosePageWidth={setPageWidth}
					/*
					 * Only PUBLISHED slots. A draft is something the business has
					 * deliberately not said yet, and the preview must not put it on the
					 * page just because the console can see it.
					 */
					publishedContent={publishedContent}
				/>
			</div>
			{/*
			  The divider between the page and the editor, and the control that
			  moves it. Four pixels wide with a wider invisible hit area, because a
			  4px target is a target somebody misses.
			*/}
			<button
				type="button"
				aria-label="Resize the editor"
				title="Drag to resize — narrows the page to phone width"
				onPointerDown={(event) => {
					event.preventDefault();
					// Keeps every subsequent pointer event aimed at this element even
					// as the pointer leaves it.
					event.currentTarget.setPointerCapture(event.pointerId);
					setDragging(true);
				}}
				onKeyDown={(event) => {
					// Reachable without a pointer at all.
					if (event.key === "ArrowLeft")
						setRailWidth((was) => Math.min(railMax(), was + 16));
					if (event.key === "ArrowRight")
						setRailWidth((was) => Math.max(RAIL_MIN, was - 16));
				}}
				className={`hidden w-1 shrink-0 cursor-col-resize border-0 transition-colors lg:block ${
					dragging
						? "bg-[rgb(var(--console-ink)/0.28)]"
						: "bg-[var(--console-line)] hover:bg-[rgb(var(--console-ink)/0.18)]"
				}`}
			/>
			{/*
			  🔑 The width rides on a CSS VARIABLE, not an inline `width`.

			  An inline width would apply at every size, including the stacked
			  layout below `lg` where the rail is full width and a pixel value is
			  simply wrong. `lg:w-[var(--rail-width)]` confines it to the breakpoint
			  that has two columns.
			*/}
			<aside
				style={{ "--rail-width": `${railWidth}px` } as React.CSSProperties}
				className="flex min-h-0 w-full shrink-0 flex-col overflow-y-auto border-[var(--console-line)] border-t bg-[var(--console-panel)] px-4 py-4 lg:w-[var(--rail-width)] lg:border-t-0"
			>
				{editor}
			</aside>
		</div>
	);
}
