import {
	CaretLeftIcon,
	CaretRightIcon,
	RowsIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useListOrder } from "../lib/list-order";
import { type ListLayout, PAGE_SIZE } from "../lib/list-view";
import { type Column, DataTable } from "./data-table";

/**
 * The two controls every list needs: how to look at it, and how to move
 * through it.
 *
 * 🔑 Shared rather than per page, for the same reason `ListControls` is: a
 * toggle that sits a pixel lower on Invoices than on Orders is the kind of
 * difference nobody can name but everybody feels.
 */

const glyph =
	"relative z-10 flex size-6 items-center justify-center transition-colors";

/** Cards or table, remembered per workspace. */
export function LayoutToggle({
	layout,
	onChange,
}: {
	layout: ListLayout;
	onChange: (layout: ListLayout) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={layout === "cards"}
			aria-label={`View: ${layout}. Switch to ${layout === "cards" ? "table" : "cards"}.`}
			onClick={() => onChange(layout === "cards" ? "table" : "cards")}
			/**
			 * 🔴 A SWITCH, not a toggle, and it is styled to say so.
			 *
			 * Table and cards are two equal choices — neither is "on" — so the
			 * control must never take an on-colour like the module switches do.
			 * What it needs instead is to be visible at all: the track was ink at
			 * 7% on a near-black surface, which is to say invisible, and the only
			 * thing marking the control was a thumb floating in a field of nothing.
			 * A real border gives the track an edge, and the thumb reads as sitting
			 * inside something.
			 */
			/* 56px track, 1px border, 3px padding: 3 + 24 + 24 + 3 across and the
			   same 3px above and below. Every number here is derived from the 24px
			   glyph slot, so the thumb sits in an even margin on all four sides
			   instead of touching the border. */
			className="relative flex h-8 w-14 shrink-0 items-center rounded-md border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.04)] p-[3px] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.08)] focus-visible:bg-[rgb(var(--console-ink)/0.08)]"
		>
			{/* The thumb slides rather than the icons swapping colour alone, so the
			    control reads as a switch at a glance. */}
			<span
				aria-hidden="true"
				/* The SAME thumb as the live/sandbox switch in Account: a raised
				   `--console-pop` puck with a real drop shadow. Ink at 14% read as a
				   smudge on the track rather than an object sitting on it, so the
				   control did not look like something you could push. */
				className={`absolute top-[3px] left-[3px] size-6 rounded-[3px] bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${
					layout === "cards" ? "translate-x-6" : "translate-x-0"
				}`}
			/>
			<span
				className={`${glyph} ${layout === "table" ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
			>
				<RowsIcon size={15} />
			</span>
			<span
				className={`${glyph} ${layout === "cards" ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
			>
				<SquaresFourIcon size={15} />
			</span>
		</button>
	);
}

/**
 * Page through a list.
 *
 * ⚠️ Renders NOTHING on a single page. A pager under a list of six is
 * furniture that says "there is more" when there is not.
 */
export function Pager({
	page,
	pageCount,
	total,
	onPage,
}: {
	page: number;
	pageCount: number;
	total: number;
	onPage: (page: number) => void;
}) {
	if (pageCount <= 1) return null;
	const step =
		"flex size-7 items-center justify-center rounded-md text-[var(--ink-45)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)] disabled:opacity-30 disabled:hover:bg-transparent";
	return (
		<div className="mt-3 flex items-center gap-2">
			<p className="min-w-0 flex-1 text-[11px] text-[var(--ink-30)]">
				Page {page} of {pageCount} · {total}{" "}
				{total === 1 ? "record" : "records"}
			</p>
			<button
				type="button"
				className={step}
				disabled={page <= 1}
				onClick={() => onPage(page - 1)}
				aria-label="Previous page"
			>
				<CaretLeftIcon size={13} />
			</button>
			<button
				type="button"
				className={step}
				disabled={page >= pageCount}
				onClick={() => onPage(page + 1)}
				aria-label="Next page"
			>
				<CaretRightIcon size={13} />
			</button>
		</div>
	);
}

/**
 * A table that pages itself.
 *
 * 🔑 Paging lives HERE rather than on each page because most pages compute
 * their filtered rows inside a render callback, where a hook cannot go. Giving
 * the table the whole list and letting it show a slice keeps every list capped
 * without restructuring twenty files.
 */
export function PagedTable<TRow extends { id: string }>({
	workspaceId,
	layout,
	rows,
	...table
}: {
	workspaceId: string;
	layout: ListLayout;
	rows: TRow[];
	columns: Array<Column<TRow>>;
	onOpen?: (row: TRow) => void;
	selectedId?: string | null;
	caption?: string;
	rowSignal?: (row: TRow) => "news" | "attention" | "failure" | null;
	onReorder?: (fromId: string, toId: string) => void;
	/** What this page can do to a set of ticked rows. */
	bulkActions?: (rows: TRow[]) => ReactNode;
	/** Shown inside the frame when there are no rows — see `DataTable`. */
	empty?: ReactNode;
	exportName?: string;
}) {
	/**
	 * Dragging happens BEFORE paging, so a row can be moved within its page and
	 * the arrangement survives turning the page. Reordering a slice would only
	 * ever shuffle the 25 rows on screen.
	 */
	const arrangement = useListOrder(workspaceId, rows);

	/**
	 * Sorting, and it happens HERE for the same reason paging does.
	 *
	 * 🔴 Sort the SLICE and you sort twenty-five rows out of two hundred — the
	 * biggest order is still on page four, and the column header lies about
	 * what it did. So the whole list is sorted, then paged.
	 *
	 * 🔑 A dragged order and a sorted one cannot both be true. Choosing a column
	 * therefore SUPERSEDES the manual arrangement rather than fighting it, and
	 * clearing the sort puts the arrangement back — nothing is lost either way.
	 */
	const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
		null,
	);

	const ordered = useMemo(() => {
		const base = sort ? rows : arrangement.rows;
		if (!sort) return base;
		const factor = sort.dir === "asc" ? 1 : -1;
		return [...base].sort((left, right) => {
			const a = (left as Record<string, unknown>)[sort.key];
			const b = (right as Record<string, unknown>)[sort.key];
			// Absent values sort last in both directions: a row with no total is
			// not "the cheapest", it is unknown, and burying it is the honest read.
			if (a === null || a === undefined) return 1;
			if (b === null || b === undefined) return -1;
			if (typeof a === "number" && typeof b === "number") {
				return (a - b) * factor;
			}
			if (typeof a === "boolean" && typeof b === "boolean") {
				return (Number(a) - Number(b)) * factor;
			}
			return (
				String(a).localeCompare(String(b), undefined, {
					numeric: true,
					sensitivity: "base",
				}) * factor
			);
		});
	}, [rows, arrangement.rows, sort]);

	const [page, setPage] = useState(1);
	const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
	// 🔴 Clamped rather than capped. Narrowing a search while on page 4 would
	// otherwise leave somebody staring at an empty page with no way back.
	const current = Math.min(page, pageCount);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-page when the result set changes
	useEffect(() => {
		setPage(1);
	}, [ordered.length, workspaceId]);

	return (
		<>
			<DataTable
				{...table}
				layout={layout}
				sort={sort}
				onSort={setSort}
				/* 🔴 No dragging while sorted. Moving a row by hand into an order the
				   column is about to overwrite is a gesture that silently does
				   nothing, which reads as the drag being broken. */
				onReorder={sort ? undefined : arrangement.move}
				rows={ordered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)}
			/>
			<div className="flex items-center gap-3">
				<Pager
					page={current}
					pageCount={pageCount}
					total={ordered.length}
					onPage={setPage}
				/>
				{/* Only once something has been moved: an ever-present "reset" implies
				    a list is arranged when it is simply in its natural order. */}
				{arrangement.arranged ? (
					<button
						type="button"
						onClick={arrangement.reset}
						className="mt-3 shrink-0 text-[11px] text-[var(--ink-30)] transition-colors hover:text-[var(--ink-75)]"
					>
						Reset order
					</button>
				) : null}
			</div>
		</>
	);
}
