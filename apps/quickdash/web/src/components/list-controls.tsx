import {
	DownloadSimpleIcon,
	FunnelIcon,
	MagnifyingGlassIcon,
	SortAscendingIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCsv } from "../lib/csv";
import {
	useHeaderRail,
	useHeaderSlots,
	usePageTakenOver,
	useTableRail,
	useViewRail,
} from "./header-action";
import { useToast } from "./toast";

/**
 * The bar above every list: search, filter, and the page's one create action.
 *
 * 🔑 Written once because twenty-nine pages each building their own produces
 * twenty-nine slightly different bars — a search box that sits a pixel lower
 * here, a filter that opens from the wrong edge there. Consistency across a
 * console is not decoration: it is what lets somebody move between Orders and
 * Reviews without re-learning where anything is.
 *
 * ⚠️ The filter popover is anchored to the whole control GROUP, not to the
 * filter button, so it spans from that button's left edge to the right edge of
 * the create action. `--radix-popover-trigger-width` measures the anchor, which
 * keeps that span exact as labels change.
 */
export function ListControls({
	query,
	onQueryChange,
	placeholder,
	filterCount,
	filter,
	action,
	exportRows,
	exportName,
	onClearFilter,
}: {
	/**
	 * ⚠️ Still accepted, no longer rendered. The console has one search, in the
	 * header. These stay in the signature because every list page passes them and
	 * filters its own rows with them — dropping them would mean editing all of
	 * those pages to remove an argument nobody reads.
	 */
	query: string;
	onQueryChange: (value: string) => void;
	placeholder: string;
	/** Shown on the filter button so an active filter is never invisible. */
	filterCount?: number;
	/** Filter controls. Omit entirely when a page has nothing to filter by. */
	filter?: ReactNode;
	/** The one create action, if the page has one. */
	action?: ReactNode;
	/**
	 * The rows to write when Export is pressed, and what to call the file.
	 *
	 * 🔑 A FUNCTION, not an array. Building a spreadsheet's worth of rows on
	 * every render to support a button almost nobody presses is work done
	 * thousands of times for one use — this way it happens on the click.
	 *
	 * ⚠️ Pass the FILTERED rows. The file should be what is on screen; a page
	 * that exports everything while showing a filtered view is a quiet lie.
	 * Omit both props on a page where a spreadsheet makes no sense.
	 */
	exportRows?: () => ReadonlyArray<Record<string, unknown>>;
	exportName?: string;
	/** Resets the page's own filters. Search is cleared here regardless. */
	onClearFilter?: () => void;
}) {
	const toast = useToast();
	// The page registers its action through `useHeaderAction`; this is where it
	// now appears. The registration API is unchanged, so no page needed editing.
	const { action: createAction } = useHeaderSlots();
	const { rail } = useHeaderRail();
	const { tableRail } = useTableRail();
	const { viewRail } = useViewRail();
	/**
	 * 🔴 Nothing to search, so nothing to search with.
	 *
	 * When the page itself has no content to operate on — it does not exist, you
	 * cannot see it, or the module is switched off — a search box, filter pills
	 * and a table/card toggle are controls over nothing. They would accept input
	 * and do nothing with it, which reads as a broken console rather than an
	 * unavailable page.
	 *
	 * ⚠️ A list that merely failed to LOAD keeps every control: the filters still
	 * describe exactly what pressing "Try again" would fetch.
	 */
	if (usePageTakenOver()) return null;

	/**
	 * Acts on the PAGE: take a copy of it, change how it looks, add to it.
	 * These stay on the breadcrumb row.
	 */
	const pageControls = (
		<div className="flex items-center justify-end gap-2">
			{exportRows ? (
				<button
					type="button"
					onClick={() => {
						const rows = exportRows();
						downloadCsv(exportName ?? "export", rows);
						/**
						 * 🔑 A download is invisible. The browser may drop the file
						 * into a folder with no prompt and no visible bar, so
						 * pressing Export and seeing nothing change is
						 * indistinguishable from the button being broken — which is
						 * exactly what somebody concludes the second time.
						 */
						toast.show({
							signal: "success",
							title: `${rows.length} ${rows.length === 1 ? "row" : "rows"} exported`,
						});
					}}
					title="Export what you can see, as a spreadsheet"
					/* `.control-raised`, the same object as the page action beside it.
					   Export was the last hand rolled button on the breadcrumb row:
					   a flat bordered rectangle standing next to a raised one, which
					   read as two buttons from two different consoles. */
					className="control-raised flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-[var(--ink-50)] outline-none hover:text-[var(--ink-85)]"
				>
					<DownloadSimpleIcon size={14} />
					Export
				</button>
			) : null}
			{createAction}
		</div>
	);

	/**
	 * Acts on the ROWS: narrow them down. These belong on the table itself.
	 *
	 * 🔑 The search box is BACK, and it is not the one that was removed. That
	 * one sat above the table pretending to be the console's search; this one is
	 * inside the table's own frame, where its scope is obvious from where it is.
	 *
	 * 🔴 The filter is an ICON. Sitting in a strip beside a search box it needs
	 * no word — and the count badge is what actually has to be readable, because
	 * an active filter you cannot see is a list quietly lying about what it
	 * holds.
	 */
	const tableControls = (
		<>
			{filter ? (
				<Popover>
					<PopoverTrigger
						aria-label="Filter"
						title="Filter"
						/* See the note on Sort: a key, and the open state is ink
						   rather than a fill that would flatten its face. */
						className="control-raised flex size-7 shrink-0 items-center justify-center rounded-md border text-[var(--ink-45)] outline-none hover:text-[var(--ink-85)] data-[state=open]:text-[var(--ink-85)]"
					>
						<FunnelIcon size={15} weight={filterCount ? "fill" : "regular"} />
					</PopoverTrigger>
					<PopoverContent
						align="start"
						sideOffset={8}
						className="w-72 rounded-2xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-3"
					>
						{filter}
					</PopoverContent>
				</Popover>
			) : null}
			{filterCount ? (
				/* 🔴 A FIXED square, not a pill that grows with its number.
				   `px-1.5` on a rounded-full span meant "3" and "12" were two
				   different shapes, so the control group changed width as you
				   filtered. A 28px squircle matching the keys either side keeps the
				   row still, and being raised makes it part of the group rather
				   than a sticker on it. */
				<span className="control-raised flex size-7 shrink-0 items-center justify-center rounded-md border text-[10.5px] text-[var(--ink-60)] tabular-nums">
					{filterCount}
				</span>
			) : null}
			{/* 🔴 Thirty views tell you to "clear the status filter" in their
			    empty state, and not one of them gave you a way to do it — you had
			    to work out which control was hiding your rows and undo it by
			    hand. It belongs HERE rather than in each empty state: this is
			    where the narrowing happened, it is one control instead of thirty,
			    and it is still there when the list is merely SHORT rather than
			    empty, which is when people actually get confused. */}
			{query || filterCount ? (
				<button
					type="button"
					onClick={() => {
						onQueryChange("");
						onClearFilter?.();
					}}
					/* Part of the group, so it is a key like the rest. See the note on
					   the count beside it. */
					className="control-raised flex h-7 shrink-0 items-center rounded-md border px-2 text-[11px] text-[var(--ink-40)] outline-none hover:text-[var(--ink-85)]"
				>
					Clear
				</button>
			) : null}
			<label className="flex min-w-0 flex-1 items-center gap-2">
				<MagnifyingGlassIcon
					size={14}
					aria-hidden="true"
					className="shrink-0 text-[var(--ink-35)]"
				/>
				<span className="sr-only">{placeholder}</span>
				<input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={placeholder}
					/* Bare, deliberately. It is already inside the table's own header
					   strip, so a second border around it would draw a box in a box. */
					className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
				/>
			</label>
		</>
	);

	return (
		<>
			{rail ? (
				createPortal(pageControls, rail)
			) : (
				<div className="mb-3">{pageControls}</div>
			)}
			{/*
			 * ⚠️ Falls back into the page row when there is no table to sit on —
			 * an empty list, a loading one, or a page that renders cards without
			 * a frame. Losing the filter exactly when a list looks empty is the
			 * worst moment to lose it: an active filter is usually WHY it looks
			 * empty.
			 */}
			{/* The view switch goes to its own slot beside Sort, not into the
			    `flex-1` rail the search box lives in. See `viewRail`. */}
			{viewRail ? createPortal(action, viewRail) : null}
			{tableRail ? (
				createPortal(tableControls, tableRail)
			) : (
				/* 🔑 `--empty-line`, because this strip only exists when there is no
					   table to sit in: an empty list, a loading one, or a page of cards
					   with no frame. It is standing alone on the panel exactly like an
					   empty state, so it needs the same visible outline rather than the
					   divider hairline it borrowed. */
				<div
					data-flat="true"
					className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--empty-line)] px-2 py-1.5"
				>
					{tableControls}
					{/* 🔴 Sort is DRAWN here, not portalled, because the real one lives
					    in `DataTable` and there is no table on this path: the page swapped
					    the whole list out for its empty state. It does nothing, and that
					    is the point. The strip is the same object on every page, and a
					    control group that loses a member when a list happens to be empty
					    reads as the console breaking rather than as there being nothing to
					    sort. Disabled, so it never pretends otherwise. */}
					<button
						type="button"
						disabled
						aria-label="Sort"
						title="Nothing to sort yet"
						className="control-raised flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] text-[var(--ink-45)] outline-none"
					>
						<SortAscendingIcon size={15} />
					</button>
					{/* Carried into the standalone strip too, or switching to cards on
					    an empty list would remove the only way back to the table. */}
					{viewRail ? null : action}
				</div>
			)}
		</>
	);
}

/**
 * One filter value, on or off.
 *
 * A row of these rather than a dropdown: the options are few and always worth
 * seeing at once, and QuickDash never uses an operating system's own menus.
 */
export function FilterChip({
	label,
	active,
	onToggle,
}: {
	label: string;
	active: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`h-7 rounded-full border px-3 text-[11px] capitalize transition-colors ${
				active
					? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
					: "border-[var(--console-line-strong)] text-[var(--ink-60)] hover:text-[var(--ink-90)]"
			}`}
		>
			{label}
		</button>
	);
}

/**
 * One list's filter, written once.
 *
 * 🔑 Fifteen pages had no filter at all, and the reason was that each one meant
 * writing the same twenty lines: a `useState`, a chip row, a count, and a
 * predicate. So none of them got written. This is those twenty lines.
 *
 * ⚠️ Empty selection means EVERYTHING, not nothing. A filter with no chip
 * pressed is a filter that has not been used yet — the alternative reads as a
 * page that has hidden all its own rows.
 */
export function useChipFilter() {
	const [selected, setSelected] = useState<readonly string[]>([]);
	return {
		count: selected.length,
		/** Put every chip back, so a filtered-empty list has a way out. */
		clear: () => setSelected([]),
		/** True when a row's value survives the current selection. */
		keep: (value: string | null | undefined) =>
			selected.length === 0 ||
			(value !== null && value !== undefined && selected.includes(value)),
		/** The chips themselves, for `ListControls`' `filter` prop. */
		chips: (label: string, options: readonly string[]) => (
			<>
				<p className="mb-2 text-[11px] text-[var(--ink-45)]">{label}</p>
				<div className="flex flex-wrap gap-1.5">
					{options.map((option) => (
						<FilterChip
							key={option}
							label={option}
							active={selected.includes(option)}
							onToggle={() =>
								setSelected((current) =>
									current.includes(option)
										? current.filter((value) => value !== option)
										: [...current, option],
								)
							}
						/>
					))}
				</div>
			</>
		),
	};
}
