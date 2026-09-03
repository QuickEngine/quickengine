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

const MODULE_ID = "dashboard";
const VIEW_NAME = "home";

export type PlacedTile = {
	id: string;
	/** Columns wide, 1 to 4. */
	cols: number;
	/** Rows tall, 1 upwards. */
	rows: number;
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
	};
	if (typeof row.id !== "string") return null;
	if (typeof row.cols === "number" && typeof row.rows === "number") {
		return { id: row.id, cols: row.cols, rows: row.rows };
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

	const saved = useQuery({
		queryKey: ["quickdash", workspaceId, "dashboard-layout"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<SavedView[]>(
					`/saved-views?moduleId=${MODULE_ID}`,
				)
			).data,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: seed once per workspace
	useEffect(() => {
		setSeeded(false);
		setTiles(null);
	}, [workspaceId]);

	useEffect(() => {
		if (seeded) return;
		if (saved.isPending) return;
		const view = Array.isArray(saved.data)
			? saved.data.find((entry) => entry.name === VIEW_NAME)
			: undefined;
		setTiles(readTiles(view?.state));
		setSeeded(true);
	}, [saved.isPending, saved.data, seeded]);

	const save = useMutation({
		mutationFn: async (next: PlacedTile[]) => {
			await workspaceApi(workspaceId).request("/saved-views", {
				method: "POST",
				body: { moduleId: MODULE_ID, name: VIEW_NAME, state: { tiles: next } },
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
			save.mutate(next);
		},
		saving: save.isPending,
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
	const ORDER: Array<{ id: string; cols: number; rows: number }> = [
		{ id: "revenue", cols: 2, rows: 2 },
		{ id: "needs-you", cols: 1, rows: 2 },
		{ id: "today", cols: 1, rows: 2 },
		{ id: "customers", cols: 1, rows: 1 },
		{ id: "products", cols: 1, rows: 1 },
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
