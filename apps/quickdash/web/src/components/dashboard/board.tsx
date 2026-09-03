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
import { WriteFailure } from "../page-state";
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
	modules,
}: {
	workspaceId: string;
	/** The slug, for links inside tiles. */
	workspace: string;
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
	 * workspace with no modules opens a tray with no tiles in it — a control
	 * that works perfectly and achieves nothing, which is how somebody decides
	 * the product is broken rather than unconfigured.
	 */
	const firstRun = modules.length === 0;
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
			{rail && !firstRun
				? createPortal(
						<button
							type="button"
							onClick={() => setEditing((open) => !open)}
							className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${
								editing
									? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
									: "border-[var(--console-line)] bg-[var(--console-panel)] text-[var(--ink-50)] hover:text-[var(--ink-85)]"
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
			{modules.length === 0 ? (
				<div className="flex flex-col items-center rounded-xl border border-[var(--console-line)] px-6 py-16 text-center">
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
				<div className="flex flex-col items-center rounded-xl border border-[var(--console-line)] border-dashed px-6 py-16 text-center">
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

			<div
				ref={gridRef}
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
									<span className="pointer-events-auto absolute top-2 left-2 flex cursor-grab items-center gap-1.5 rounded-md bg-[var(--console-pop)] px-2 py-1 text-[10.5px] text-[var(--ink-45)] shadow-sm active:cursor-grabbing">
										<ArrowsOutCardinalIcon size={12} />
										{tile.name}
									</span>
									<button
										type="button"
										aria-label={`Remove ${tile.name}`}
										onClick={() =>
											layout.save(shown.filter((row) => row.id !== entry.id))
										}
										className="pointer-events-auto absolute top-2 right-2 flex size-6 items-center justify-center rounded-md bg-[var(--console-pop)] text-[var(--ink-45)] shadow-sm transition-colors hover:text-[var(--signal-failure-text)]"
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
