import {
	ArrowsOutCardinalIcon,
	CheckIcon,
	PlusIcon,
	SlidersHorizontalIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	defaultLayout,
	type PlacedTile,
	useDashboardLayout,
} from "../../lib/dashboard-layout";
import { clientEnv } from "../../lib/env";
import { useHeaderRail } from "../header-action";
import { inlineFailure, WriteFailure } from "../page-state";
import { BOARD_COLUMNS, TILES } from "./tiles";

/**
 * The dashboard somebody arranged.
 *
 * 🔴 Modules decide what is AVAILABLE; the person decides what is ON SCREEN.
 * Making the board a function of the modules would force a shipping tile on
 * somebody who never looks at one — turning a module on should make its tiles
 * offerable, not compulsory.
 *
 * 🔑 Dragging reflows LIVE. The order changes as you move across the board and
 * the other tiles shift to meet you, so what you see while dragging is what you
 * get when you let go. A drag that only commits on drop makes you aim at a
 * result you cannot see.
 *
 * ⚠️ Editing is a MODE. Drag handles and remove buttons on a board you are only
 * reading are chrome nobody asked for, and one stray click rearranges something
 * you liked.
 */
export function DashboardBoard({
	workspaceId,
	workspace,
	modulesKnown = true,
	modulesError = null,
	modules,
}: {
	workspaceId: string;
	/** The slug, for links inside tiles. */
	workspace: string;
	/** True only when the module list actually loaded. See `firstRun`. */
	modulesKnown?: boolean;
	/** Why it did not load, when it did not. */
	modulesError?: unknown;
	modules: ReadonlyArray<{ id: string }>;
}) {
	const layout = useDashboardLayout(workspaceId);
	const [editing, setEditing] = useState(false);
	const [dragging, setDragging] = useState<string | null>(null);
	/** The order being previewed mid-drag, before anything is written. */
	const [preview, setPreview] = useState<PlacedTile[] | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const { rail } = useHeaderRail();
	const resizing = useRef<string | null>(null);

	const enabled = new Set(modules.map((module) => module.id));
	/**
	 * ⚠️ Nothing to arrange, so nothing that arranges it. "Edit board" on a
	 * workspace with no modules opens a tray with no tiles in it, a control that
	 * works perfectly and achieves nothing, which is how somebody decides the
	 * product is broken rather than unconfigured.
	 *
	 * 🔴 `modulesKnown` gates it. An empty array means "none are on" ONLY when
	 * the request came back; when it failed it means "we have no idea", and
	 * telling a working business to go and configure itself is the worse of the
	 * two mistakes by a distance.
	 */
	const firstRun = modulesKnown && modules.length === 0;
	/**
	 * 🔑 Loading is a THIRD answer, and the board had no word for it.
	 *
	 * While the module list is in flight nothing is known: not which tiles
	 * belong here, not whether any do. The board drew the three tiles that need
	 * no module and left the rest of the page blank, so the first thing anybody
	 * saw was a lopsided half board that then rearranged itself. A skeleton in
	 * the shape of the real grid holds the space instead, and flips to whichever
	 * answer arrives.
	 */
	const loadingModules = !modulesKnown && !modulesError;
	const available = TILES.filter(
		(tile) => !tile.module || enabled.has(tile.module),
	);

	// 🔴 A missing layout is a NEW board, not an empty one.
	const placed = preview ?? layout.tiles ?? defaultLayout(enabled, available);

	// A tile whose module was switched off after it was placed simply stops
	// appearing; the layout is left alone, so turning the module back on brings
	// it back where it was.
	const shown = placed.filter((entry) =>
		available.some((tile) => tile.id === entry.id),
	);
	const unplaced = available.filter(
		(tile) => !placed.some((entry) => entry.id === tile.id),
	);

	/** Move `fromId` to sit where `overId` currently is. */
	const reorder = (list: PlacedTile[], fromId: string, overId: string) => {
		if (fromId === overId) return list;
		const next = [...list];
		const from = next.findIndex((entry) => entry.id === fromId);
		const to = next.findIndex((entry) => entry.id === overId);
		if (from < 0 || to < 0) return list;
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		return next;
	};

	/**
	 * Free resize, in whole cells.
	 *
	 * 🔑 Snapped to the grid rather than to pixels. A tile 1.4 columns wide
	 * cannot exist, so a resize that let you try would spend its whole life
	 * fighting you back to a legal size. Measuring the real grid means the
	 * snapping matches what is on screen at any window width.
	 */
	const startResize = (event: React.PointerEvent, tile: PlacedTile) => {
		event.preventDefault();
		event.stopPropagation();
		const grid = gridRef.current;
		if (!grid) return;
		resizing.current = tile.id;

		const box = grid.getBoundingClientRect();
		const gap = 12;
		const cell = (box.width - gap * (BOARD_COLUMNS - 1)) / BOARD_COLUMNS;
		const rowHeight = 104 + gap;
		const originX = event.clientX;
		const originY = event.clientY;

		const onMove = (move: PointerEvent) => {
			const cols = Math.min(
				BOARD_COLUMNS,
				Math.max(1, tile.cols + Math.round((move.clientX - originX) / cell)),
			);
			const rows = Math.max(
				1,
				tile.rows + Math.round((move.clientY - originY) / rowHeight),
			);
			setPreview((current) =>
				(current ?? shown).map((entry) =>
					entry.id === tile.id ? { ...entry, cols, rows } : entry,
				),
			);
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("blur", onUp);
			resizing.current = null;
			setPreview((current) => {
				if (current) layout.save(current);
				return null;
			});
		};
		// 🔴 On the WINDOW, not the handle. A pointer that leaves the handle mid
		// drag must keep resizing, and pointer capture can be lost.
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("blur", onUp);
	};

	if (layout.isPending) return null;

	return (
		<>
			{layout.failure ? <WriteFailure message={layout.failure} /> : null}

			{/* 🔑 The board's one control rides the breadcrumb row, the same rail
			    every list page portals its controls into — so Home does not have a
			    button bar of its own that no other page has. */}
			{rail && !firstRun && !loadingModules
				? createPortal(
						<button
							type="button"
							onClick={() => setEditing((open) => !open)}
							/* 🔑 The same control as the header's, because it is the same
							   kind of thing: a button you press on the console's chrome.
							   `control-lift` while editing so the ink fill survives, see
							   the note on `.control-raised`. */
							className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] ${
								/* 🔴 No ink fill for the active state.
								   `--console-ink` is off white in dark, so "Done" became a
								   bright slab in a header of dark raised controls: the one
								   element that broke the surface it sat on. The button is
								   the same object either way, and being ON is said by the
								   ink of its label, not by inverting it. */
								editing
									? "control-raised border-[var(--console-line-strong)] text-[var(--ink-90)]"
									: "control-raised border-[var(--console-line)] text-[var(--ink-50)] hover:text-[var(--ink-85)]"
							}`}
						>
							{editing ? (
								<CheckIcon size={13} />
							) : (
								<SlidersHorizontalIcon size={13} />
							)}
							{editing ? "Done" : "Edit board"}
						</button>,
						rail,
					)
				: null}

			{editing ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-35)]">
					Drag a card to move it. Drag its bottom-right corner to resize.
				</p>
			) : null}

			{/* 🔴 FIRST RUN, and it is not the same thing as an empty board.
			    A workspace with no modules showed "Your board is empty — press
			    Edit board to add the things you want to see", which is advice
			    that cannot be followed: every tile belongs to a module and none
			    are on. Meanwhile the sidebar said "No modules are enabled". Two
			    panels, contradicting each other, on the first screen somebody
			    ever sees.

			    A workspace this new has nothing to arrange yet. It needs telling
			    what a module IS and where to turn one on, which is a different
			    sentence and a different destination. */}
			{loadingModules ? (
				/* An even grid, deliberately: eight identical cards on the real
				   geometry. A skeleton that guesses at the finished arrangement
				   is a second layout to maintain, and it is wrong the moment
				   somebody rearranges their board. */
				/* 🔑 The BENTO, not eight identical squares.
				   A uniform grid is a different layout from the one that arrives,
				   so the page visibly rearranges the moment it loads. These are the
				   real proportions from `defaultLayout`: a wide revenue block, two
				   tall columns, a row of small counters and a full width strip. The
				   skeleton is a picture of what is coming rather than a placeholder
				   shaped like nothing. */
				<div
					aria-busy="true"
					className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[104px] lg:grid-cols-4"
				>
					<span className="sr-only">Loading your board…</span>
					{[
						"lg:col-span-2 lg:row-span-2",
						"lg:col-span-1 lg:row-span-2",
						"lg:col-span-1 lg:row-span-2",
						"lg:col-span-1 lg:row-span-1",
						"lg:col-span-1 lg:row-span-1",
						"lg:col-span-2 lg:row-span-1",
						"lg:col-span-4 lg:row-span-2",
					].map((span, index) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed length placeholder
							key={index}
							style={{ boxShadow: "var(--lift-card)" }}
							/* 🔴 `shimmer-busy`, not `shimmer`.
							   `.shimmer` sets a background IMAGE, which paints over the
							   background colour, so on a card sized element the gradient
							   becomes the surface and the tile is never seen: the skeleton
							   glowed at 7 to 16 percent ink while the real card sits at
							   four steps off black. `.shimmer-busy` sweeps over the top
							   instead, so the card keeps its own face and the glint passes
							   across it. */
							className={`shimmer-busy ${span} flex h-full min-h-[104px] flex-col gap-2 rounded-xl border border-[var(--console-line)] bg-[var(--surface-tile)] p-4`}
						>
							<div className="h-2.5 w-24 rounded bg-[rgb(var(--console-ink)/0.05)]" />
							<div className="mt-1 h-6 w-16 rounded bg-[rgb(var(--console-ink)/0.04)]" />
							<div className="mt-auto h-2 w-full rounded bg-[rgb(var(--console-ink)/0.035)]" />
						</div>
					))}
				</div>
			) : modulesError ? (
				/* 🔴 Silence was the third possible answer, and the worst one.
				   With the module list unavailable the board had no tiles to draw
				   and no first-run message it was allowed to show, so it rendered
				   an empty page: identical to a workspace with nothing in it, and
				   identical to a board somebody had cleared. Say which. */
				<div className="flex flex-col items-center rounded-xl border border-[var(--empty-line)] px-6 py-16 text-center">
					<p className="text-[13px] text-[var(--ink-80)]">
						This board could not load
					</p>
					<p className="mt-1.5 max-w-[26rem] text-[11.5px] text-[var(--ink-35)] leading-5">
						{inlineFailure(modulesError)}
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="mt-5 inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-90"
					>
						Try again
					</button>
				</div>
			) : firstRun ? (
				<div className="flex flex-col items-center rounded-xl border border-[var(--empty-line)] px-6 py-16 text-center">
					<p className="text-[13px] text-[var(--ink-80)]">
						This workspace is empty
					</p>
					<p className="mt-1.5 max-w-[26rem] text-[11.5px] text-[var(--ink-35)] leading-5">
						Nothing is switched on yet. A module is one part of running a
						business, such as orders, products, customers or invoicing, and you
						pick the ones you need. Everything on this page comes from them, so
						it stays empty until at least one is on.
					</p>
					<a
						href={`${clientEnv.ACCOUNT_URL}/workspaces/${encodeURIComponent(workspace)}`}
						className="mt-5 inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] no-underline transition-opacity hover:opacity-90"
					>
						Choose your modules
					</a>
				</div>
			) : shown.length === 0 ? (
				/* 🔑 Removing every tile is a legitimate thing to do, and a board
				   that answered it with a blank page would read as broken. It says
				   what happened and offers the way back. */
				<div className="flex flex-col items-center rounded-xl border border-[var(--empty-line)] border-dashed px-6 py-16 text-center">
					<p className="text-[13px] text-[var(--ink-80)]">
						Your board is empty
					</p>
					<p className="mt-1.5 max-w-[24rem] text-[11.5px] text-[var(--ink-35)] leading-5">
						{editing
							? "Pick something from below to put on it."
							: "Press Edit board to add the things you want to see first thing in the morning."}
					</p>
				</div>
			) : null}

			{/* 🔴 The grid was a SIBLING of the message, so it drew anyway.
			    "This workspace is empty" printed with three tiles stacked under
			    it, and "This board could not load" printed above a board that had
			    visibly loaded. The three moduleless tiles are workspace scoped on
			    purpose, so they survive with no modules enabled and were exactly
			    the ones that showed through. A message that replaces the board has
			    to replace the board. */}
			<div
				ref={gridRef}
				hidden={loadingModules || Boolean(modulesError) || firstRun}
				className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[104px] lg:grid-cols-4"
			>
				{shown.map((entry) => {
					const tile = available.find((candidate) => candidate.id === entry.id);
					if (!tile) return null;
					return (
						/* biome-ignore lint/a11y/noStaticElementInteractions: the card is
						   the drag surface while editing; the keyboard path is the remove
						   button in its overlay, which is a real button. */
						<div
							key={entry.id}
							style={{
								gridColumn: `span ${Math.min(entry.cols, BOARD_COLUMNS)}`,
								gridRow: `span ${entry.rows}`,
							}}
							className={`relative min-w-0 transition-opacity ${
								dragging === entry.id ? "opacity-40" : ""
							}`}
							draggable={editing && resizing.current === null}
							onDragStart={(event) => {
								setDragging(entry.id);
								event.dataTransfer.setData("text/plain", entry.id);
								event.dataTransfer.effectAllowed = "move";
							}}
							onDragEnd={() => {
								setDragging(null);
								// The preview IS the arrangement by now — keep it.
								setPreview((current) => {
									if (current) layout.save(current);
									return null;
								});
							}}
							onDragOver={
								editing
									? (event) => {
											event.preventDefault();
											if (!dragging || dragging === entry.id) return;
											// 🔑 Reflow AS YOU MOVE, not on drop.
											setPreview((current) =>
												reorder(current ?? shown, dragging, entry.id),
											);
										}
									: undefined
							}
						>
							<tile.Render workspaceId={workspaceId} workspace={workspace} />

							{editing ? (
								/* Laid OVER the tile: a tile knows nothing about being
								   edited, and giving every one an edit prop would mean ten
								   components caring about a mode that belongs to the board. */
								<div className="pointer-events-none absolute inset-0 rounded-xl bg-[rgb(var(--console-ink)/0.04)] ring-1 ring-[rgb(var(--console-ink)/0.10)] ring-inset">
									{/* 🔑 The handle alone. The tile's name was in the badge as
									    well, which made the grip a different width on every card
									    and repeated a label already printed inside the tile. */}
									{/* ⚠️ `aria-hidden`, not `aria-label`. A bare span has no role,
									    so a label on it is not exposed to anything and Biome is
									    right to refuse it. The grip is decoration: the drag is on
									    the tile, and the tile already carries its own name. */}
									<span
										aria-hidden="true"
										data-hint={`Move ${tile.name}`}
										className="pointer-events-auto absolute top-2 left-2 flex size-6 cursor-grab items-center justify-center rounded-md bg-[var(--console-pop)] text-[var(--ink-45)] shadow-sm active:cursor-grabbing"
									>
										<ArrowsOutCardinalIcon size={12} />
									</span>
									<button
										type="button"
										aria-label={`Remove ${tile.name}`}
										data-hint="Remove this card"
										onClick={() =>
											layout.save(shown.filter((row) => row.id !== entry.id))
										}
										/* Brightens rather than turning red. Red is reserved for a fault
										   or a loss of money, and removing a tile from your own
										   board is neither: the layout is yours and putting it
										   back is one press. */
										className="pointer-events-auto absolute top-2 right-2 flex size-6 items-center justify-center rounded-md bg-[var(--console-pop)] text-[var(--ink-45)] shadow-sm transition-colors hover:text-[var(--ink-90)]"
									>
										<XIcon size={12} weight="bold" />
									</button>
									{/* The resize corner. Any size, snapped to whole cells. */}
									<button
										type="button"
										aria-label={`Resize ${tile.name}`}
										onPointerDown={(event) => startResize(event, entry)}
										className="pointer-events-auto absolute right-1 bottom-1 flex size-5 cursor-nwse-resize items-center justify-center rounded text-[var(--ink-30)] hover:text-[var(--ink-70)]"
									>
										<svg
											width="10"
											height="10"
											viewBox="0 0 10 10"
											aria-hidden="true"
											fill="none"
										>
											<title>Resize</title>
											<path
												d="M9 1v8H1"
												stroke="currentColor"
												strokeWidth="1.5"
												strokeLinecap="round"
											/>
										</svg>
									</button>
								</div>
							) : null}
						</div>
					);
				})}
			</div>

			{editing && unplaced.length > 0 ? (
				<div className="mt-6">
					<p className="mb-2 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
						Add to your board
					</p>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{unplaced.map((tile) => (
							<button
								key={tile.id}
								type="button"
								onClick={() =>
									layout.save([
										...shown,
										{
											id: tile.id,
											cols: tile.defaultCols,
											rows: tile.defaultRows,
										},
									])
								}
								className="flex items-start gap-2.5 rounded-xl border border-[var(--console-line)] border-dashed p-3 text-left transition-colors hover:border-[var(--console-line-strong)]"
							>
								<PlusIcon
									size={13}
									className="mt-0.5 shrink-0 text-[var(--ink-35)]"
								/>
								<span className="min-w-0">
									<span className="block text-[12px] text-[var(--ink-80)]">
										{tile.name}
									</span>
									<span className="mt-0.5 block text-[11px] text-[var(--ink-30)] leading-4">
										{tile.blurb}
									</span>
								</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</>
	);
}
