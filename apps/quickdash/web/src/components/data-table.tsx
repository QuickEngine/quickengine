import {
	CheckIcon,
	DotsSixVerticalIcon,
	MinusIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useTableRail } from "./header-action";

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
}) {
	const { setTableRail } = useTableRail();
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
	const strip = (
		<div className="flex items-center gap-2 border-[var(--console-line-soft)] border-b bg-[rgb(var(--console-ink)/0.02)] px-2 py-1.5">
			{/* Filter, search and sort arrive here by portal from `ListControls`.
			    Selection is NOT here: it belongs on the header row with the
			    columns, directly above the boxes it ticks. */}
			<div
				ref={setTableRail}
				className="flex min-w-0 flex-1 items-center gap-2"
			/>
		</div>
	);

	if (layout === "cards") {
		return (
			<>
				{/* Cards have no frame of their own, so the strip takes one — the
				    controls must not vanish just because the view changed. */}
				<div
					style={{ boxShadow: "var(--card-lift)" }}
					className="mb-3 overflow-hidden rounded-xl border border-[var(--console-line)] bg-[var(--console-card)]"
				>
					{strip}
				</div>
				<CardList
					{...{ columns, rows, onOpen, selectedId, rowSignal, onReorder }}
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
			style={{ boxShadow: "var(--card-lift)" }}
			className="overflow-hidden rounded-xl border border-[var(--console-line)] bg-[var(--console-card)]"
		>
			{strip}
			{/* Wide tables scroll inside the box rather than pushing the page
			    sideways, which would drag the sidebar off screen with them. */}
			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-left">
					{caption ? <caption className="sr-only">{caption}</caption> : null}
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
									className={`${column.width ?? ""} whitespace-nowrap px-3 py-2 font-normal text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em] ${
										column.align === "right" ? "text-right" : "text-left"
									}`}
								>
									{column.header ?? column.key}
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
}: {
	columns: Array<Column<TRow>>;
	rows: TRow[];
	onOpen?: (row: TRow) => void;
	selectedId?: string | null;
	rowSignal?: (row: TRow) => "news" | "attention" | "failure" | null;
	onReorder?: (fromId: string, toId: string) => void;
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
					style={{ boxShadow: "var(--card-lift)" }}
					className={`relative rounded-xl border bg-[var(--console-card)] p-3 outline-none transition-colors ${
						onOpen ? "cursor-pointer" : ""
					} ${
						selectedId === row.id
							? "border-[rgb(var(--console-ink)/0.35)]"
							: "border-[var(--console-line-soft)] hover:border-[var(--console-line-strong)]"
					}`}
				>
					{/* In the card's own padding, at the corner — same reasoning as the
					    table: the heading must not shift because something needs
					    attention. */}
					<RowDot signal={rowSignal?.(row) ?? null} inCard />
					<p className="truncate text-[12.5px] text-[var(--ink-85)]">
						{lead.render(row)}
					</p>

					<dl className="mt-2 space-y-1">
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
