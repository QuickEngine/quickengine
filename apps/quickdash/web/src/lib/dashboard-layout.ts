import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "./api";

/**
 * The board somebody has arranged, per person, per workspace.
 *
 * 🔑 Stored in `saved_views`, which already exists with full CRUD and is
 * already keyed by user AND workspace. That is exactly right: two people in one
 * business want different boards, and a layout is a preference rather than a
 * fact about the business. No migration, no new endpoint.
 *
 * ⚠️ The POST UPSERTS BY NAME, so saving twice updates rather than piling up
 * views. That is why the name is a constant — one board per person for now,
 * and named boards later come free because `pinned` and `position` are already
 * on the table.
 *
 * 🔴 A missing view is not an empty board. Somebody who has never arranged
 * anything gets the default for their modules — an empty dashboard with "add
 * your first tile" makes every new customer do setup work to reach the state we
 * could have given them.
 */

/**
 * How far back the whole board looks.
 *
 * 🔑 ONE range for the board, not one per card. A dashboard is read as a single
 * picture: revenue over 7 days beside traffic over 90 is two questions on one
 * screen, and nothing on it can be compared. Every tile that takes a range
 * takes this one.
 */
export const BOARD_RANGES = [
	{ id: "7d", label: "7D", days: 7 },
	{ id: "30d", label: "30D", days: 30 },
	{ id: "90d", label: "90D", days: 90 },
	{ id: "1y", label: "1Y", days: 365 },
] as const;

export type BoardRange = (typeof BOARD_RANGES)[number]["id"];

const RANGE_KEY = "quickdash.board.range";

/** Remembered per person, like the theme: it is a way of looking, not data. */
export function readBoardRange(): BoardRange {
	try {
		const saved = localStorage.getItem(RANGE_KEY);
		return BOARD_RANGES.some((range) => range.id === saved)
			? (saved as BoardRange)
			: "7d";
	} catch {
		return "7d";
	}
}

export function writeBoardRange(range: BoardRange) {
	try {
		localStorage.setItem(RANGE_KEY, range);
	} catch {
		// It applies for this session and simply is not remembered.
	}
}

export const rangeDays = (range: BoardRange) =>
	BOARD_RANGES.find((entry) => entry.id === range)?.days ?? 7;

const MODULE_ID = "dashboard";

/**
 * The board somebody lands on.
 *
 * 🔴 A CONSTANT default rather than "the first one", so a workspace with three
 * saved views always opens the same one. Ordering by id or creation date would
 * mean the dashboard you get depends on which view you happened to make first,
 * which is not something anybody chose.
 */
const DEFAULT_VIEW = "Home";

/** Which saved view was last open, per workspace. */
const ACTIVE_KEY = (workspaceId: string) =>
	`quickdash.board.view.${workspaceId}`;

/**
 * ⚠️ Five, and the cap is deliberate rather than technical.
 *
 * Saved views are for a handful of ways of looking — the morning board, the
 * fulfilment board, the one for the accountant. Past that they stop being
 * views and become a filing problem: a switcher nobody can scan, and a set
 * nobody remembers the contents of. The table would happily hold hundreds.
 */
export const MAX_VIEWS = 5;

export type PlacedTile = {
	id: string;
	/** Columns wide, 1 to 4. */
	cols: number;
	/** Rows tall, 1 upwards. */
	rows: number;
	/**
	 * Where the tile sits, 1-indexed like CSS grid lines.
	 *
	 * 🔴 Boards used to be a LIST: order in the array, flowed by the grid. That
	 * made a gap impossible to fill on purpose — a tile could only take another
	 * tile's place, never an empty spot, because the empty spot had no identity.
	 * A position gives the board holes, which is what "arrange it how I like"
	 * actually means.
	 *
	 * ⚠️ Optional, and absent means "flow". Every board saved before this has no
	 * positions, and inventing some on read would silently rearrange boards
	 * people already built. They keep flowing until something is dragged.
	 */
	col?: number;
	row?: number;
	/**
	 * How this tile draws its series.
	 *
	 * ⚠️ Optional, and absent means the tile's own default. A board saved before
	 * the picker existed has no opinion, and inventing one would change charts
	 * people never asked to change.
	 */
	chart?: string;
};

/**
 * Read a placed tile out of whatever a board was saved as.
 *
 * ⚠️ Boards saved before free sizing carry `span: "2x2"`. Migrating on read
 * rather than in a script means nobody's board resets because the model grew,
 * and the next save writes the new shape.
 */
function toPlaced(value: unknown): PlacedTile | null {
	if (!value || typeof value !== "object") return null;
	const row = value as {
		id?: unknown;
		cols?: unknown;
		rows?: unknown;
		span?: unknown;
		col?: unknown;
		row?: unknown;
		chart?: unknown;
	};
	if (typeof row.id !== "string") return null;
	const at = {
		col: typeof row.col === "number" ? row.col : undefined,
		row: typeof row.row === "number" ? row.row : undefined,
		chart: typeof row.chart === "string" ? row.chart : undefined,
	};
	if (typeof row.cols === "number" && typeof row.rows === "number") {
		return { id: row.id, cols: row.cols, rows: row.rows, ...at };
	}
	if (typeof row.span === "string") {
		const [cols, rows] = row.span.split("x").map(Number);
		return { id: row.id, cols: cols || 1, rows: rows || 1 };
	}
	return { id: row.id, cols: 1, rows: 1 };
}

type SavedView = {
	id: string;
	moduleId: string;
	name: string;
	state: { tiles?: PlacedTile[] };
};

/**
 * Pull the tiles out of a saved view's `state`, whatever shape it arrives in.
 *
 * 🔴 Defensive on purpose. `state` is a `jsonb` column typed as an open record,
 * and it has reached the client as a STRING rather than an object — at which
 * point `state.tiles` is `undefined`, the board silently falls back to the
 * default, and every edit writes that default straight back. That failure is
 * invisible: no error, no empty state, just a board that will not change.
 */
function readTiles(state: unknown): PlacedTile[] | null {
	const parsed =
		typeof state === "string"
			? (() => {
					try {
						return JSON.parse(state) as unknown;
					} catch {
						return null;
					}
				})()
			: state;
	if (!parsed || typeof parsed !== "object") return null;
	const tiles = (parsed as { tiles?: unknown }).tiles;
	if (!Array.isArray(tiles)) return null;
	return tiles
		.map(toPlaced)
		.filter((tile): tile is PlacedTile => tile !== null);
}

export function useDashboardLayout(workspaceId: string) {
	/**
	 * 🔴 The BOARD owns the layout; the server is where it is kept.
	 *
	 * This used to read the saved view and re-derive the board from it on every
	 * change, which made the screen depend on a round trip to show you your own
	 * drag — and if that read ever came back empty, every edit silently wrote
	 * the default straight back and nothing ever appeared to work. Local state
	 * is the truth while you are editing; the request is a write-through.
	 *
	 * ⚠️ Seeded ONCE, from the first successful read. Re-seeding on every fetch
	 * would let a background refetch stomp an edit made half a second earlier.
	 */
	const [tiles, setTiles] = useState<PlacedTile[] | null>(null);
	const [seeded, setSeeded] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	/**
	 * Which saved view is open.
	 *
	 * ⚠️ Remembered per WORKSPACE, in the browser. It is a way of looking rather
	 * than a fact about the business, and it is per person already — putting it
	 * on the server would mean the view you left open follows you to a machine
	 * where you were doing something else.
	 */
	const [view, setView] = useState(DEFAULT_VIEW);

	const saved = useQuery({
		queryKey: ["quickdash", workspaceId, "dashboard-layout"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<SavedView[]>(
					`/saved-views?moduleId=${MODULE_ID}`,
				)
			).data,
	});

	useEffect(() => {
		setSeeded(false);
		setTiles(null);
		try {
			setView(localStorage.getItem(ACTIVE_KEY(workspaceId)) ?? DEFAULT_VIEW);
		} catch {
			setView(DEFAULT_VIEW);
		}
	}, [workspaceId]);

	useEffect(() => {
		if (seeded) return;
		if (saved.isPending) return;
		const rows = Array.isArray(saved.data) ? saved.data : [];
		/**
		 * ⚠️ Falls back to the DEFAULT view, then to the built-in board. A name
		 * remembered in this browser can point at a view somebody has since
		 * deleted — from another machine, or in another tab — and a dashboard that
		 * answered that with a blank screen would look broken rather than
		 * out of date.
		 */
		const named = (name: string) =>
			rows.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
		/**
		 * ⚠️ Matched case-INSENSITIVELY, and that is a migration rather than
		 * politeness. Every board saved before named views existed is under the
		 * constant `"home"`; the default is now `"Home"` because it is shown to
		 * people. An exact match would have quietly handed every existing customer
		 * an empty dashboard and made them rebuild it.
		 */
		const found = named(view) ?? named(DEFAULT_VIEW);
		setTiles(readTiles(found?.state));
		setSeeded(true);
	}, [saved.isPending, saved.data, seeded, view]);

	const save = useMutation({
		mutationFn: async ({
			tiles: next,
			name,
		}: {
			tiles: PlacedTile[];
			name: string;
		}) => {
			// The POST upserts by name, so saving a view twice updates it rather
			// than piling up duplicates. See the note at the top of this file.
			await workspaceApi(workspaceId).request("/saved-views", {
				method: "POST",
				body: { moduleId: MODULE_ID, name, state: { tiles: next } },
			});
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change could not be saved."),
		onSuccess: () => setFailure(null),
	});

	return {
		/** `null` until seeded, so a default is not flashed then replaced. */
		tiles,
		isPending: !seeded,
		failure,
		/** Applies immediately, then writes through. */
		save: (next: PlacedTile[]) => {
			setTiles(next);
			save.mutate({ tiles: next, name: view });
		},
		saving: save.isPending,

		/**
		 * Every board this person has here.
		 *
		 * ⚠️ Always includes the one that is OPEN, even before it has been saved.
		 * A switcher that listed nothing while plainly showing a board would read
		 * as the list being broken; somebody who has never pressed save still has
		 * a board, it just has not been written down yet.
		 */
		views: [
			...new Set([
				view,
				...(Array.isArray(saved.data) ? saved.data : [])
					.filter((entry) => entry.moduleId === MODULE_ID)
					.map((entry) => entry.name),
			]),
		],
		view,
		/** Open another view. The board reseeds from it. */
		open: (name: string) => {
			try {
				localStorage.setItem(ACTIVE_KEY(workspaceId), name);
			} catch {
				// It applies for this session and simply is not remembered.
			}
			setView(name);
			setSeeded(false);
		},
		/**
		 * Save the board that is on screen under a new name.
		 *
		 * 🔑 Copies the CURRENT arrangement rather than starting empty. "Save as"
		 * on a board is almost always "this, but I want to keep the old one too",
		 * and handing somebody a blank grid at that moment throws away the work
		 * they were trying to preserve.
		 */
		saveAs: (name: string) => {
			const clean = name.trim();
			if (!clean || !tiles) return;
			save.mutate({ tiles, name: clean });
			try {
				localStorage.setItem(ACTIVE_KEY(workspaceId), clean);
			} catch {
				// See above.
			}
			setView(clean);
			void saved.refetch();
		},
		/**
		 * Delete a board.
		 *
		 * 🔴 Deleting the one you are LOOKING AT CLEARS THE SCREEN.
		 *
		 * It used to reseed the preset, on the reasoning that "delete and start
		 * again" should hand somebody the board they would have had on day one.
		 * That was wrong, and Asher put it plainly: deleting a save should remove
		 * everything on the screen. Pressing delete and watching a full board
		 * reappear reads as the delete having failed, and there was then no way to
		 * clear a board at all.
		 *
		 * 🔑 The two actions now answer two different questions and neither
		 * impersonates the other. **Delete empties. Reset restores the preset.**
		 *
		 * ⚠️ The empty board is SAVED, not just shown. Clearing the screen and
		 * then finding the preset back after a reload is the same broken promise
		 * one step later.
		 *
		 * ⚠️ Deleting a board you are not looking at changes nothing on screen.
		 */
		remove: async (name: string) => {
			const rows = Array.isArray(saved.data) ? saved.data : [];
			const found = rows.find(
				(entry) => entry.name.toLowerCase() === name.toLowerCase(),
			);
			// A board that was never saved has no row to delete; dropping the local
			// name is the whole job.
			if (found) {
				await workspaceApi(workspaceId).request(`/saved-views/${found.id}`, {
					method: "DELETE",
				});
			}
			if (name === view) {
				setView(DEFAULT_VIEW);
				setSeeded(true);
				setTiles([]);
				save.mutate({ tiles: [], name: DEFAULT_VIEW });
			}
			void saved.refetch();
		},
		/**
		 * Put the board back to the preset, keeping its name.
		 *
		 * 🔑 Separate from delete, because they answer different questions.
		 * Delete is "I do not want this board"; reset is "I want this board back
		 * the way it started" — and somebody who has spent time naming and
		 * arranging four boards should not have to destroy one to tidy it.
		 */
		reset: () => {
			setSeeded(false);
			setTiles(null);
		},
	};
}

/**
 * What a workspace starts with.
 *
 * 🔑 Derived from the modules it HAS, in the order somebody reads a morning:
 * money, then what needs a person, then what is happening, then the record.
 * A board that arrives useful is the difference between a product that works
 * and one that asks you to build it first.
 *
 * ⚠️ The sizes are chosen so the default TILES cleanly — four columns, no
 * holes. Somebody can leave gaps afterwards, deliberately; arriving to one is
 * different.
 */
export function defaultLayout(
	enabled: ReadonlySet<string>,
	catalogue: ReadonlyArray<{ id: string; module?: string }>,
): PlacedTile[] {
	/**
	 * 🔑 ONE preset, filtered by what the workspace has. Not one board per
	 * business type.
	 *
	 * There are 106 business recipes and they differ by which MODULES they turn
	 * on, which is the same thing this list is already filtered by. A hundred and
	 * six hand written boards would be a hundred and six things to keep in step
	 * with the tile catalogue, and every one of them would drift the first time a
	 * tile was renamed. A single ordering, filtered, covers every recipe by
	 * construction and covers the ones nobody has invented yet.
	 *
	 * ⚠️ The order is the READING order, not an importance ranking: money first
	 * because it is what people open the page for, then what needs a person, then
	 * the counts, then the log. A workspace missing the early ones simply starts
	 * further down the list rather than getting a hole.
	 *
	 * 🔴 It must name a tile for EVERY module. It used to stop after seven
	 * commerce tiles, so a consultancy or a plumber — no orders, no products, no
	 * revenue — landed on three tiles and a lot of empty grid, which reads as the
	 * product having nothing for them.
	 */
	const ORDER: Array<{ id: string; cols: number; rows: number }> = [
		{ id: "revenue", cols: 2, rows: 2 },
		{ id: "needs-you", cols: 1, rows: 2 },
		{ id: "today", cols: 1, rows: 2 },
		{ id: "invoices-outstanding", cols: 1, rows: 1 },
		{ id: "fulfilment-pending", cols: 1, rows: 1 },
		{ id: "projects-active", cols: 1, rows: 1 },
		{ id: "bookings-scheduled", cols: 1, rows: 1 },
		/* ⚠️ Two by two, the size the calendar needs to be a month rather than a
		   list. It sits with the counts rather than at the top because a business
		   opens this page for its money first; the count beside it answers "how
		   many" and the calendar answers "when". */
		{ id: "calendar", cols: 2, rows: 2 },
		{ id: "customers", cols: 1, rows: 1 },
		{ id: "products", cols: 1, rows: 1 },
		{ id: "stock-low", cols: 1, rows: 1 },
		{ id: "contracts-waiting", cols: 1, rows: 1 },
		{ id: "orders-week", cols: 2, rows: 1 },
		{ id: "activity", cols: 4, rows: 2 },
	];
	return ORDER.flatMap((entry) => {
		const tile = catalogue.find((candidate) => candidate.id === entry.id);
		if (!tile) return [];
		if (tile.module && !enabled.has(tile.module)) return [];
		return [{ id: entry.id, cols: entry.cols, rows: entry.rows }];
	});
}
