import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	DotsSixVerticalIcon,
	DownloadSimpleIcon,
	MinusIcon,
	SortAscendingIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { type ReactNode, useState } from "react";
import { downloadCsv } from "../lib/csv";
import { useTableRail, useViewRail } from "./header-action";
import { useToast } from "./toast";

/**
 * The table every list page uses.
 *
 * 🔴 Lists were rows of floating text separated by rules: no headings, and
 * columns aligned only by whatever fixed width each page happened to pick. That
 * reads as loose text rather than data — you cannot tell what a number means
 * without guessing, and two pages showing the same kind of record lined their
 * columns up differently.
 *
 * 🔑 A real `<table>`, not a grid of divs. Headers are what make a column
 * legible, and a screen reader announces "Total, $73.60" instead of reading a
 * bare number adrift in a row.
 *
 * ⚠️ Column widths are declared ONCE per page, here, rather than repeated on
 * every cell. That is what stops a heading and its values drifting apart.
 *
 * 🔴 EVERY ROW IS ONE LINE. Cells never stack a second line underneath — a
 * secondary detail becomes its own COLUMN, or it does not appear. Two-line rows
 * make a table's height jump per row, which destroys the alignment that is the
 * only reason to use a table, and reads as loose text again. Enforced here with
 * `whitespace-nowrap`, so a stacked cell is visibly wrong rather than tolerated.
 */

export type Column<TRow> = {
	/** Stable key. Also the header text unless `header` says otherwise. */
	key: string;
	header?: ReactNode;
	/** Tailwind width, e.g. `w-24`. Omit for the column that should absorb slack. */
	width?: string;
	align?: "left" | "right";
	/** Cells that are actions rather than data — no truncation, no wrap. */
	tight?: boolean;
	/**
	 * Cells containing their own controls.
	 *
	 * 🔴 Clicks inside these must NOT open the row. Pressing "Mark paid" and
	 * having the detail panel fly open over the list is the exact bug a
	 * row-wide click handler causes, and it is why only the first cell used to
	 * be clickable. Inferred for columns with no heading, since that is what
	 * every action column is.
	 */
	interactive?: boolean;
	render: (row: TRow) => ReactNode;
};

/**
 * The console's checkbox.
 *
 * 🔴 Not `<input type="checkbox">` with a border on it. A native checkbox is
 * painted by the operating system, so it arrives in the OS accent colour and
 * ignores the theme entirely — which is the one thing this console does not
 * allow. The real input stays, `sr-only`, so keyboard and screen readers get a
 * genuine checkbox; the square beside it is what you see.
 */
function TickBox({
	checked,
	partial,
	onChange,
	label,
}: {
	checked: boolean;
	partial?: boolean;
	onChange: (checked: boolean) => void;
	label: string;
}) {
	const on = checked || partial;
	return (
		<label className="flex size-7 cursor-pointer items-center justify-center">
			<input
				type="checkbox"
				checked={checked}
				aria-label={label}
				onChange={(event) => onChange(event.target.checked)}
				className="peer sr-only"
			/>
			<span
				aria-hidden="true"
				className={`flex size-[15px] items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[rgb(var(--console-ink)/0.25)] ${
					on
						? "border-transparent bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
						: "border-[var(--console-line-strong)] text-transparent"
				}`}
			>
				{partial ? (
					<MinusIcon size={10} weight="bold" />
				) : checked ? (
					<CheckIcon size={10} weight="bold" />
				) : null}
			</span>
		</label>
	);
}

export function DataTable<TRow extends { id: string }>({
	columns,
	rows,
	onOpen,
	selectedId,
	caption,
	rowSignal,
	onReorder,
	layout = "table",
	sort = null,
	onSort,
	bulkActions,
	empty,
	renderCard,
	exportName,
}: {
	columns: Array<Column<TRow>>;
	rows: TRow[];
	/** Makes each row open its detail. Omit for lists with nothing behind them. */
	onOpen?: (row: TRow) => void;
	selectedId?: string | null;
	/** Announced to screen readers; never drawn. */
	caption?: string;
	/**
	 * Which rows need a person, and how loudly.
	 *
	 * 🔑 A dot on the ROW, not a count above the list. "3 orders need attention"
	 * tells you how many; a dot tells you WHICH — and which is the thing you act
	 * on. Same three colours as the bell, the sidebar and the toasts, so the
	 * vocabulary is learned once.
	 */
	rowSignal?: (row: TRow) => "news" | "attention" | "failure" | null;
	/**
	 * Lets rows be dragged into a different order.
	 *
	 * ⚠️ Rearranging is a READING preference kept per person — see
	 * `useListOrder`. Dragging never changes the record, so a list somebody has
	 * arranged looks different to a teammate, deliberately.
	 */
	onReorder?: (fromId: string, toId: string) => void;
	/**
	 * 🔑 Cards are the SAME columns, stacked. Defining a second layout per page
	 * would let the two drift until they showed different facts about one
	 * record; here the switch cannot change what a list is about, only its
	 * shape.
	 */
	layout?: "table" | "cards";
	/** What the list is sorted by, owned by `PagedTable` so it can sort before paging. */
	sort?: { key: string; dir: "asc" | "desc" } | null;
	onSort?: (sort: { key: string; dir: "asc" | "desc" } | null) => void;
	/**
	 * What this page can do to a set of rows, beyond exporting them.
	 *
	 * 🔴 Passed IN rather than inferred. Deleting six orders and deleting six
	 * draft products are different acts with different consequences, and a
	 * generic "delete" that guessed would eventually guess wrong.
	 */
	bulkActions?: (rows: TRow[]) => ReactNode;
	/**
	 * What to show INSIDE the frame when there are no rows.
	 *
	 * 🔴 This exists because of a focus bug, and the bug is worth remembering.
	 * Views used to swap the whole table out for an empty state the moment a
	 * search matched nothing — which unmounted the table, and with it the strip
	 * that the search box is PORTALLED into. So the input was destroyed and
	 * rebuilt in its fallback container on the keystroke that emptied the list,
	 * and you lost the caret after one character. Typing in an already-empty
	 * list worked fine, which is what made it look like a mystery.
	 *
	 * Keeping the frame mounted keeps the rail mounted, so the input is never
	 * re-created. The empty message belongs inside the box anyway: the border
	 * is what tells you where the data starts and stops.
	 */
	empty?: ReactNode;
	/**
	 * A page's OWN card, for when generic columns are the wrong shape.
	 *
	 * 🔴 Products is the reason. A product card leads with a photograph — that
	 * is what somebody scans a catalogue by — and the generic card leads with
	 * the first column and labels the rest. So Products grew a hand-rolled grid
	 * outside this component and lost everything it provides: the raised strip,
	 * the layout toggle, paging, selection, export. It also lost the surface
	 * and shadow, which is why it was flat while every other card view was not.
	 *
	 * Supplying the card here keeps the design and gets the rest back.
	 */
	renderCard?: (row: TRow) => ReactNode;
	/** Names the file when a selection is exported. */
	exportName?: string;
}) {
	const toast = useToast();
	const { setTableRail } = useTableRail();
	const { setViewRail } = useViewRail();

	/**
	 * 🔑 A column is sortable when its `key` names a field the rows actually
	 * carry. `render` returns a ReactNode, so there is nothing to compare in the
	 * cell itself — but almost every column is keyed after the field it shows,
	 * which makes this true without a line of per-page configuration.
	 *
	 * ⚠️ Checked against the FIRST row, not the column list. A column called
	 * "actions" holds buttons and belongs to no field; sorting by it would order
	 * the table by `undefined`.
	 */
	const sample = rows[0] as Record<string, unknown> | undefined;
	const sortable = (column: Column<TRow>) =>
		Boolean(onSort) &&
		Boolean(column.header) &&
		sample !== undefined &&
		column.key in sample;

	const toggleSort = (key: string) => {
		if (!onSort) return;
		if (sort?.key !== key) return onSort({ key, dir: "asc" });
		// asc → desc → off. A third press restores whatever order the list had.
		if (sort.dir === "asc") return onSort({ key, dir: "desc" });
		return onSort(null);
	};
	/**
	 * ⚠️ Keyed by row id and scoped to THIS page of rows. "Select all" means the
	 * rows in front of you, never every record behind the pager — an action
	 * applied to records you have not seen is how somebody deletes a thousand
	 * things meaning to delete ten.
	 */
	const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
	const onPage = rows.filter((row) => picked.has(row.id)).length;
	const allOnPage = rows.length > 0 && onPage === rows.length;
	const pickAll = (checked: boolean) =>
		setPicked(checked ? new Set(rows.map((row) => row.id)) : new Set());

	/**
	 * Where narrowing lives: a filter button and a search box, on the table
	 * itself.
	 *
	 * 🔑 `empty:hidden` rather than a conditional. The children arrive by portal
	 * from `ListControls`, so this element cannot know at render time whether
	 * anything will land in it — CSS can, once they have. A page with no
	 * controls gets no empty bar and no stray border.
	 */
	const sortableColumns = columns.filter(sortable);
	const sorted = sortableColumns.find((column) => column.key === sort?.key);

	const chosen = rows.filter((row) => picked.has(row.id));

	/**
	 * 🔑 The strip becomes an ACTION BAR while rows are ticked.
	 *
	 * Not a second bar appearing above or below: selection is a mode, and the
	 * controls that narrow a list are meaningless while you are acting on a
	 * subset of it. Filtering mid-selection would silently change what "these
	 * rows" means.
	 */
	const bar = (
		<div className="flex items-center gap-2 border-[var(--console-line-soft)] border-b bg-[rgb(var(--console-ink)/0.04)] px-2 py-1.5">
			<span className="shrink-0 px-1 text-[11.5px] text-[var(--ink-80)] tabular-nums">
				{chosen.length} selected
			</span>
			<div className="min-w-0 flex-1" />
			{/* ⚠️ Export works on EVERY page with no per-page wiring, because the
			    rows are already in hand. Anything destructive is passed in by the
			    page, which is the only thing that knows what deleting means. */}
			<button
				type="button"
				onClick={() => {
					downloadCsv(exportName ?? "selection", chosen);
					// Same reasoning as the page-level Export: the file arrives
					// silently, so nothing on screen would otherwise change.
					toast.show({
						signal: "success",
						title: `${chosen.length} ${chosen.length === 1 ? "row" : "rows"} exported`,
					});
				}}
				/* Raised, like every other button that does something. See the note
				   on the breadcrumb Export in `ListControls`. */
				className="control-raised flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] text-[var(--ink-60)] hover:text-[var(--ink-90)]"
			>
				<DownloadSimpleIcon size={13} />
				Export
			</button>
			{bulkActions?.(chosen)}
			<button
				type="button"
				onClick={() => setPicked(new Set())}
				/* A key like the rest of the bar. It was the last bare text button
				   in a row of raised ones. */
				className="control-raised flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11.5px] text-[var(--ink-45)] outline-none hover:text-[var(--ink-85)]"
			>
				Clear
			</button>
		</div>
	);

	const strip = (
		<div className="flex items-center gap-2 border-[var(--console-line-soft)] border-b bg-[rgb(var(--console-ink)/0.02)] px-2 py-1.5">
			{/* Filter, search and sort arrive here by portal from `ListControls`.
			    Selection is NOT here: it belongs on the header row with the
			    columns, directly above the boxes it ticks. */}
			<div
				ref={setTableRail}
				className="flex min-w-0 flex-1 items-center gap-2"
			/>
			{/* The view switch, portalled in from `ListControls`. It sits beside
			    Sort because the two ask the same question: how do you want to
			    look at these rows. See `viewRail`. */}
			<div
				ref={setViewRail}
				/* 🔑 The switch reads the list's state through the rail it lands in.
				   Same rule the frame follows: an empty list is an outline around an
				   absence, so nothing inside it should be raised or cut in. It also
				   cannot be a prop, because the pages pass the switch in and the
				   emptiness is only known here. */
				data-flat={rows.length === 0 ? "true" : undefined}
				className="flex shrink-0 items-center"
			/>
			{/*
			 * Sort lives HERE, not in `ListControls`, because this is where the
			 * columns are. `ListControls` has no idea what a page's columns are
			 * called, which is why its sort button could only ever be a placeholder.
			 */}
			{sortableColumns.length > 0 ? (
				<Popover>
					<PopoverTrigger
						aria-label="Sort"
						title={sorted ? `Sorted by ${sorted.header}` : "Sort"}
						/* 🔴 A real key, like every other button in the console.
						   Sort and Filter were the last two ghost buttons on the
						   strip: no surface at all until you hovered, at which point
						   an ink tint appeared. Next to a switch cut into the strip
						   that reads as two controls from two different products.

						   ⚠️ No open-state fill. `.control-raised` owns the face, and
						   a background tint on top of it would flatten the gradient
						   that makes it a key. Open and sorted are both said by the
						   ink, the same rule the Done button follows. */
						className={`control-raised flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] outline-none data-[state=open]:text-[var(--ink-90)] ${
							sorted ? "text-[var(--ink-80)]" : "text-[var(--ink-45)]"
						}`}
					>
						<SortAscendingIcon size={15} />
						{sorted ? (
							<span className="max-w-[8rem] truncate">{sorted.header}</span>
						) : null}
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={8}
						className="w-56 rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1"
					>
						<p className="px-2 pt-1.5 pb-1 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
							Sort by
						</p>
						{sortableColumns.map((column) => {
							const active = sort?.key === column.key;
							return (
								<button
									key={column.key}
									type="button"
									onClick={() => toggleSort(column.key)}
									className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] ${
										active ? "text-[var(--ink-90)]" : "text-[var(--ink-60)]"
									}`}
								>
									<span className="min-w-0 flex-1 truncate">
										{column.header}
									</span>
									{/* The arrow says which way, and pressing again reverses it.
									    A third press clears the sort entirely. */}
									{active ? (
										sort?.dir === "asc" ? (
											<ArrowUpIcon size={12} weight="bold" />
										) : (
											<ArrowDownIcon size={12} weight="bold" />
										)
									) : null}
								</button>
							);
						})}
						{sort ? (
							<button
								type="button"
								onClick={() => onSort?.(null)}
								className="mt-1 flex w-full items-center rounded-lg border-[var(--console-line-soft)] border-t px-2 py-1.5 text-[11.5px] text-[var(--ink-45)] transition-colors hover:text-[var(--ink-85)]"
							>
								Clear sort
							</button>
						) : null}
					</PopoverContent>
				</Popover>
			) : null}
		</div>
	);

	if (layout === "cards") {
		return (
			<>
				{/* Cards have no frame of their own, so the strip takes one — the
				    controls must not vanish just because the view changed. */}
				<div
					/* The same material as the cards under it: see the note on the
					   table frame. A strip on the old 2px drop sat visibly flatter
					   than the grid it was labelling. */
					style={{ boxShadow: "var(--lift-card)" }}
					className="mb-3 overflow-hidden rounded-xl border border-[var(--console-line)] bg-[var(--surface-tile)]"
				>
					{strip}
				</div>
				<CardList
					{...{
						columns,
						rows,
						onOpen,
						selectedId,
						rowSignal,
						onReorder,
						renderCard,
					}}
				/>
			</>
		);
	}
	return (
		/**
		 * 🔑 CONTAINED, like every other block on these pages. A bare table reads
		 * as loose rows floating on the page background; the same border and
		 * radius the empty state uses makes it a single object, which is what
		 * tells you where the data starts and stops.
		 *
		 * `overflow-hidden` is what lets the first and last rows sit inside the
		 * rounded corners instead of squaring them off.
		 */
		<div
			/* 🔑 Raised when it holds something, flat when it does not.
			   An empty list is an outline around an absence — giving it a shadow
			   makes the console insist on a container that has nothing in it.
			   With rows, the frame is an object sitting on the page and the lift
			   is what separates the data from the floor. Same rule the workspace
			   picker follows, and the reason the two screenshots looked like two
			   different products before. */
			/* 🔴 `--lift-card` and `--surface-tile`, the console's real relief, not
			   the original 2px `--card-lift` drop on the header's face. A table is
			   the single largest object on most of these pages, and it was the
			   flattest thing on screen: it sat one step off a near black floor
			   with a hairline doing all the work, while the dashboard beside it
			   had cards rising out of the same ground. Whatever a list is called,
			   it is made of the same material as everything else now. */
			style={{
				boxShadow: rows.length === 0 ? undefined : "var(--lift-card)",
			}}
			className={`overflow-hidden rounded-xl border border-[var(--console-line)] ${
				rows.length === 0 ? "" : "bg-[var(--surface-tile)]"
			}`}
		>
			{chosen.length > 0 ? bar : strip}
			{rows.length === 0 && empty ? (
				<div className="px-4 py-10">{empty}</div>
			) : (
				<>
					{/* Wide tables scroll inside the box rather than pushing the page
			    sideways, which would drag the sidebar off screen with them. */}
					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-left">
							{caption ? (
								<caption className="sr-only">{caption}</caption>
							) : null}
							<thead>
								<tr className="border-[var(--console-line-soft)] border-b bg-[rgb(var(--console-ink)/0.02)]">
									{/* The signal gutter. Headed by nothing — a column of dots needs
							    no label, and one would be wider than the column. */}
									<th scope="col" className="w-9 pl-2">
										<TickBox
											checked={allOnPage}
											partial={onPage > 0 && !allOnPage}
											onChange={pickAll}
											label="Select all on page"
										/>
									</th>
									{rowSignal ? <th scope="col" className="w-6" /> : null}
									{columns.map((column) => (
										<th
											key={column.key}
											scope="col"
											aria-sort={
												sort?.key === column.key
													? sort.dir === "asc"
														? "ascending"
														: "descending"
													: undefined
											}
											className={`${column.width ?? ""} whitespace-nowrap px-3 py-2 font-normal text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em] ${
												column.align === "right" ? "text-right" : "text-left"
											}`}
										>
											{/* 🔑 The heading is the shortcut; the popover is the menu.
									    Pressing a column is what people try first, and it is
									    also the only way to discover the list is sortable at
									    all. Columns that name no field stay plain text. */}
											{sortable(column) ? (
												<button
													type="button"
													onClick={() => toggleSort(column.key)}
													className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-[var(--ink-60)] ${
														sort?.key === column.key
															? "text-[var(--ink-70)]"
															: ""
													}`}
												>
													{column.header ?? column.key}
													{sort?.key === column.key ? (
														sort.dir === "asc" ? (
															<ArrowUpIcon size={10} weight="bold" />
														) : (
															<ArrowDownIcon size={10} weight="bold" />
														)
													) : null}
												</button>
											) : (
												(column.header ?? column.key)
											)}
										</th>
									))}
									{/* Headed by nothing: a column of grab handles needs no label,
							    and any word would be wider than the column. */}
									{onReorder ? <th scope="col" className="w-9" /> : null}
								</tr>
							</thead>
							<tbody className="divide-y divide-[var(--console-line-soft)]">
								{rows.map((row) => (
									<tr
										key={row.id}
										/* The WHOLE row is the thing you pick up; the handle on the
								   right is what tells you so. Restricting the gesture to the
								   handle made a 9px target out of a full-width row. */
										draggable={Boolean(onReorder)}
										onDragStart={
											onReorder
												? (event) => {
														event.dataTransfer.setData("text/plain", row.id);
														event.dataTransfer.effectAllowed = "move";
													}
												: undefined
										}
										// Without preventDefault the browser refuses the drop outright.
										onDragOver={
											onReorder ? (event) => event.preventDefault() : undefined
										}
										onDrop={
											onReorder
												? (event) => {
														event.preventDefault();
														const from =
															event.dataTransfer.getData("text/plain");
														if (from) onReorder(from, row.id);
													}
												: undefined
										}
										onClick={onOpen ? () => onOpen(row) : undefined}
										onKeyDown={
											onOpen
												? (event) => {
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															onOpen(row);
														}
													}
												: undefined
										}
										tabIndex={onOpen ? 0 : undefined}
										className={`group/row transition-colors outline-none ${onOpen ? "cursor-pointer focus-visible:bg-[rgb(var(--console-ink)/0.05)]" : ""} ${
											selectedId === row.id
												? "bg-[rgb(var(--console-ink)/0.04)]"
												: onOpen
													? "hover:bg-[rgb(var(--console-ink)/0.025)]"
													: ""
										}`}
									>
										{/*
								  🔑 A COLUMN, not a mark inside the first cell. That cell
								  carries `truncate` — `overflow: hidden` — which clips
								  anything positioned in its padding, and inserting the dot
								  inline pushed every name in the table sideways. A gutter
								  does neither, and reads as a scannable line down the edge.
								*/}
										{/* 🔴 Stops the click here. Without this, ticking a row would
								    also fire the row's own open handler and throw the detail
								    panel over the list you are selecting in. */}
										<td
											className="w-9 pl-2 align-middle"
											onClick={(event) => event.stopPropagation()}
											onKeyDown={(event) => event.stopPropagation()}
										>
											<TickBox
												checked={picked.has(row.id)}
												onChange={(checked) =>
													setPicked((current) => {
														const next = new Set(current);
														if (checked) next.add(row.id);
														else next.delete(row.id);
														return next;
													})
												}
												label="Select row"
											/>
										</td>
										{rowSignal ? (
											<td className="w-6 pl-3 align-middle">
												<RowDot signal={rowSignal(row) ?? null} />
											</td>
										) : null}
										{columns.map((column, _index) => (
											<td
												key={column.key}
												className={`h-10 whitespace-nowrap px-3 align-middle text-[12.5px] text-[var(--ink-85)] ${
													column.align === "right" ? "text-right" : ""
												} ${column.tight ? "" : "max-w-0 truncate"}`}
											>
												{/* 🔑 The WHOLE row opens the record. Only cells holding
										    their own controls swallow the click, so pressing an
										    action button never also opens the panel behind it. */}
												{(column.interactive ?? column.header === "") ? (
													// biome-ignore lint/a11y/useKeyWithClickEvents: this only stops a click reaching the row
													// biome-ignore lint/a11y/noStaticElementInteractions: a wrapper, not a control
													<span onClick={(event) => event.stopPropagation()}>
														{column.render(row)}
													</span>
												) : (
													column.render(row)
												)}
											</td>
										))}
										{/*
										 * The grab handle, and the ONLY draggable thing in the row.
										 *
										 * 🔴 `draggable` used to sit on the whole `<tr>`, which meant
										 * you could not select text in a cell without the browser
										 * starting a drag instead. A handle makes the gesture
										 * deliberate and tells you the rows move, which a draggable
										 * row with no affordance never did.
										 *
										 * ⚠️ Always visible, not revealed on hover: a control you can
										 * only find by accident is not discoverable, and on a touch
										 * screen there is no hover to reveal it with.
										 */}
										{onReorder ? (
											<td className="w-9 pr-2 align-middle">
												<span
													aria-hidden="true"
													className="flex size-7 cursor-grab items-center justify-center rounded-md text-[var(--ink-30)] transition-colors group-hover/row:text-[var(--ink-60)] active:cursor-grabbing"
												>
													<DotsSixVerticalIcon size={15} />
												</span>
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}

/**
 * The same rows as cards.
 *
 * The FIRST column is the card's heading and the rest become labelled lines,
 * because the first column is already the one every table leads with — the
 * record's name. A column with no header (actions) keeps its controls but
 * loses the label, which would otherwise be a blank line.
 */
function CardList<TRow extends { id: string }>({
	columns,
	rows,
	onOpen,
	selectedId,
	rowSignal,
	onReorder,
	renderCard,
}: {
	columns: Array<Column<TRow>>;
	rows: TRow[];
	onOpen?: (row: TRow) => void;
	selectedId?: string | null;
	rowSignal?: (row: TRow) => "news" | "attention" | "failure" | null;
	onReorder?: (fromId: string, toId: string) => void;
	renderCard?: (row: TRow) => ReactNode;
}) {
	const [lead, ...rest] = columns;
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
			{rows.map((row) => (
				<article
					key={row.id}
					draggable={Boolean(onReorder)}
					onDragStart={
						onReorder
							? (event) => {
									event.dataTransfer.setData("text/plain", row.id);
									event.dataTransfer.effectAllowed = "move";
								}
							: undefined
					}
					onDragOver={onReorder ? (event) => event.preventDefault() : undefined}
					onDrop={
						onReorder
							? (event) => {
									event.preventDefault();
									const from = event.dataTransfer.getData("text/plain");
									if (from) onReorder(from, row.id);
								}
							: undefined
					}
					onClick={onOpen ? () => onOpen(row) : undefined}
					onKeyDown={
						onOpen
							? (event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onOpen(row);
									}
								}
							: undefined
					}
					tabIndex={onOpen ? 0 : undefined}
					/* 🔴 A real card, not a rectangle with a hairline.
					   `--card-lift` is a 2px drop — right for a tile lying flat on
					   a page, invisible on something 240px wide that is supposed to
					   look picked up. And `--console-card` is one step off the
					   floor, so the shadow had almost nothing to fall onto. The
					   same elevation the workspace picker uses, on the outlet's own
					   face: `--surface-tile` rising out of the near black ground,
					   `--lift-card` under it, and a pixel of rise on hover so it
					   answers the pointer. The picker uses `--surface-card` because
					   it sits on a different, lighter ground; borrowing that here
					   put the header's face on the outlet's floor. */
					style={{ boxShadow: "var(--lift-card)" }}
					className={`relative rounded-xl border bg-[var(--surface-tile)] p-3 outline-none transition-[transform,border-color] duration-150 ${
						onOpen ? "cursor-pointer hover:-translate-y-px" : ""
					} ${
						selectedId === row.id
							? "border-[rgb(var(--console-ink)/0.35)]"
							: "border-[var(--console-line)] hover:border-[var(--console-line-strong)]"
					}`}
				>
					{/* In the card's own padding, at the corner — same reasoning as the
					    table: the heading must not shift because something needs
					    attention. */}
					<RowDot signal={rowSignal?.(row) ?? null} inCard />
					{/* A page's own card replaces the body, never the frame — the
					    surface, the lift, the selection border and the dot are the
					    parts that must look the same everywhere. */}
					{renderCard ? (
						renderCard(row)
					) : (
						<p className="truncate text-[12.5px] text-[var(--ink-85)]">
							{lead.render(row)}
						</p>
					)}

					<dl className={renderCard ? "hidden" : "mt-2 space-y-1"}>
						{rest.map((column) => {
							const value = column.render(row);
							// Nothing to say is better said by absence than by an empty row.
							if (value === null || value === undefined || value === "") {
								return null;
							}
							return (
								<div key={column.key} className="flex items-baseline gap-2">
									{column.header ? (
										<dt className="shrink-0 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
											{column.header}
										</dt>
									) : null}
									<dd className="min-w-0 flex-1 truncate text-right text-[12px] text-[var(--ink-85)]">
										{value}
									</dd>
								</div>
							);
						})}
					</dl>
				</article>
			))}
		</div>
	);
}

/**
 * The mark beside a record that needs a person.
 *
 * ⚠️ Always occupies its space, even when there is nothing to say. A dot that
 * appears and disappears shifts every name in the column sideways, which makes
 * a quiet list look like it is twitching.
 */
function RowDot({
	signal,
	inCard = false,
}: {
	signal: "news" | "attention" | "failure" | null;
	/** A card has no left gutter, so its marker sits in the top corner instead. */
	inCard?: boolean;
}) {
	// Nothing at all when there is nothing to say — absolute positioning means an
	// absent dot costs no space, so there is no placeholder to keep.
	if (!signal) return null;
	const colour = {
		news: "var(--signal-news)",
		attention: "var(--signal-attention)",
		failure: "var(--signal-failure)",
	}[signal];
	return (
		<span
			aria-hidden="true"
			className={`size-1.5 rounded-full ${
				inCard ? "absolute top-2 right-2" : "block"
			}`}
			style={{ background: colour }}
		/>
	);
}
