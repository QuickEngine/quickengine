import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { workspaceApi } from "../../lib/api";
import {
	addMonths,
	dayKey,
	firstWeekday,
	startOfMonth,
	weekdayLabels,
	weeksFor,
} from "../../lib/calendar-dates";
import { calendarFit, GAP } from "../../lib/calendar-fit";
import { useMeasure } from "../charts";

/**
 * The workspace's month, with what is booked on it.
 *
 * ⚠️ Deliberately NOT a tile. It takes a size and fills it, and knows nothing
 * about the dashboard grid, so the same component can hang in the QuickTools
 * tray or float over another page without being written twice. The tile in
 * `tiles.tsx` is a four line wrapper around this.
 *
 * 🔴 Every date here is LOCAL. `startsAt` arrives as an ISO string carrying an
 * offset, and reading its UTC parts puts an eight in the evening appointment on
 * tomorrow for anyone west of Greenwich. A calendar that shows the wrong day is
 * worse than no calendar, because it is believed.
 */
export function WorkspaceCalendar({ workspaceId }: { workspaceId: string }) {
	const box = useMeasure<HTMLDivElement>();
	const [month, setMonth] = useState(() => startOfMonth(new Date()));
	const [picked, setPicked] = useState<string | null>(() => dayKey(new Date()));

	/**
	 * The grid always shows whole weeks, so it reaches into the months either
	 * side. Those days get their bookings too: a dot that appears only once you
	 * page to the next month is a dot that lied.
	 */
	const grid = useMemo(() => weeksFor(month, FIRST_DAY), [month]);
	const from = grid[0];
	const to = new Date(grid[grid.length - 1]);
	to.setHours(23, 59, 59, 999);

	/**
	 * ⚠️ `limit=100` is the endpoint's CEILING, not a preference: the query
	 * schema caps it at 100 and rejects anything larger, so asking for 200
	 * returns a 400 rather than more bookings.
	 *
	 * ⚠️ `direction=asc` because the endpoint defaults to DESCENDING. On a month
	 * busy enough to hit the ceiling, descending drops the days at the start of
	 * the month, which is the half of the grid you are most likely looking at.
	 *
	 * 🔴 It does NOT follow `nextCursor`, and that is deliberate: this endpoint
	 * returns a bare uuid where `decodeCursor` expects an encoded pair, so the
	 * cursor is silently discarded and the second page is the first page again.
	 * Paging here would loop. Recorded in TECH_DEBT.md; until it is fixed the
	 * honest thing is one page, and to say so when it fills.
	 */
	const bookings = useQuery({
		queryKey: ["quickdash", workspaceId, "calendar", dayKey(from), dayKey(to)],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					items: Booking[];
					page?: { hasMore?: boolean };
				}>(
					`/bookings?limit=100&sort=startsAt&direction=asc&from=${encodeURIComponent(
						from.toISOString(),
					)}&to=${encodeURIComponent(to.toISOString())}`,
				)
			).data,
	});
	/** True when the month holds more than one page can show. See above. */
	const clipped = bookings.data?.page?.hasMore === true;

	/** Bookings bucketed by the local day they start on. */
	const byDay = useMemo(() => {
		const map = new Map<string, Booking[]>();
		for (const item of bookings.data?.items ?? []) {
			if (!item.startsAt) continue;
			const when = new Date(item.startsAt);
			if (Number.isNaN(when.getTime())) continue;
			const day = dayKey(when);
			const list = map.get(day);
			if (list) list.push(item);
			else map.set(day, [item]);
		}
		return map;
	}, [bookings.data]);

	const today = dayKey(new Date());

	/**
	 * 🔑 What fits decides what is drawn, and `calendarFit` decides it alone.
	 *
	 * 🔴 The arithmetic used to live here and moved the stranded space around
	 * instead of removing it. It is now one tested function: the tiles that scale
	 * well on this board are the charts, which STRETCH, and a calendar cannot
	 * stretch without becoming unreadable, so the slack is handed to the day list
	 * instead of left as margin. See the note on `calendarFit`.
	 */
	const area = useMeasure<HTMLDivElement>();
	const layout = calendarFit(area.width, area.height);
	const listed = layout.list !== "none";

	const days = (
		<div
			className="grid shrink-0"
			style={{
				gridTemplateColumns: `repeat(7, ${layout.cell.width}px)`,
				gap: GAP,
			}}
		>
			{/*
			 * 🔴 ONE grid, holding the weekday row AND the days.
			 *
			 * They were two separate grids stacked, and two grids can only line
			 * their columns up by coincidence: the labels sized themselves to their
			 * own text while the cells sized themselves to the tile, so the card read
			 * as two tables that happened to be near each other. Sharing one
			 * `grid-template-columns` makes them one table by construction, and no
			 * arithmetic keeps them in step.
			 */}
			{WEEKDAYS.map((label) => (
				<span
					key={label.full}
					className="truncate pb-[3px] text-center text-[var(--ink-30)] uppercase leading-none tracking-[0.04em]"
					style={{ fontSize: layout.cell.width >= 34 ? 9.5 : 8.5 }}
				>
					{layout.cell.width >= 34 ? label.short : label.narrow}
				</span>
			))}
			{grid.map((day) => {
				const id = dayKey(day);
				const count = byDay.get(id)?.length ?? 0;
				return (
					<Day
						key={id}
						day={day}
						width={layout.cell.width}
						height={layout.cell.height}
						count={count}
						outside={day.getMonth() !== month.getMonth()}
						today={id === today}
						picked={id === picked}
						onPick={() => setPicked(id)}
					/>
				);
			})}
		</div>
	);

	const list = listed ? (
		<DayList
			items={picked ? (byDay.get(picked) ?? []) : []}
			picked={picked}
			loading={bookings.isPending}
			beside={layout.list === "beside"}
			width={layout.listWidth}
		/>
	) : null;

	return (
		<div ref={box.ref} className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<Header
				month={month}
				compact={layout.mode === "agenda"}
				onMove={(step) => setMonth(addMonths(month, step))}
				onToday={() => {
					const now = new Date();
					setMonth(startOfMonth(now));
					setPicked(dayKey(now));
				}}
			/>
			<div ref={area.ref} className="flex min-h-0 flex-1 flex-col">
				{layout.mode === "grid" ? (
					<div
						className={`flex min-h-0 flex-1 ${
							layout.list === "beside"
								? "flex-row items-start gap-3"
								: "flex-col items-center"
						}`}
					>
						{days}
						{list}
						{clipped ? (
							<p className="mt-1 shrink-0 text-center text-[10.5px] text-[var(--ink-30)]">
								Showing the first 100 this month.
							</p>
						) : null}
					</div>
				) : (
					<Agenda
						items={bookings.data?.items ?? []}
						loading={bookings.isPending}
						compact={area.height < 96}
					/>
				)}
			</div>
		</div>
	);
}

type Booking = {
	id: string;
	title: string | null;
	clientName: string | null;
	status: string | null;
	startsAt: string | null;
	location: string | null;
};

/** Resolved once: the reader's region does not change mid session. */
const FIRST_DAY = firstWeekday();
const WEEKDAYS = weekdayLabels(FIRST_DAY);

function Header({
	month,
	compact,
	onMove,
	onToday,
}: {
	month: Date;
	/**
	 * Shown beside an agenda rather than a grid.
	 *
	 * ⚠️ The month name and the paging arrows belong to the GRID. Next to a list
	 * of upcoming appointments they steer something that is not on screen, so the
	 * header shrinks to what the list is: what is coming up.
	 */
	compact: boolean;
	onMove: (step: number) => void;
	onToday: () => void;
}) {
	if (compact) {
		return (
			<p className="mb-1.5 shrink-0 truncate text-[11px] text-[var(--ink-45)]">
				Coming up
			</p>
		);
	}
	return (
		<div className="mb-1.5 flex shrink-0 items-center gap-1">
			<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
				{month.toLocaleDateString(undefined, {
					month: "long",
					year: "numeric",
				})}
			</p>
			<button
				type="button"
				data-hint="Today"
				onClick={onToday}
				className="control-raised flex h-6 shrink-0 items-center rounded-[5px] border px-1.5 text-[10.5px] text-[var(--ink-55)] outline-none hover:text-[var(--ink-90)]"
			>
				Today
			</button>
			<Step label="Previous month" glyph="‹" onClick={() => onMove(-1)} />
			<Step label="Next month" glyph="›" onClick={() => onMove(1)} />
		</div>
	);
}

function Step({
	label,
	glyph,
	onClick,
}: {
	label: string;
	glyph: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			data-hint={label}
			aria-label={label}
			onClick={onClick}
			className="control-raised flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border text-[13px] text-[var(--ink-55)] outline-none hover:text-[var(--ink-90)]"
		>
			{glyph}
		</button>
	);
}

function Day({
	day,
	width,
	height,
	count,
	outside,
	today,
	picked,
	onPick,
}: {
	day: Date;
	/** Cell width and height, equal unless the fit widened them to fill. */
	width: number;
	height: number;
	count: number;
	outside: boolean;
	today: boolean;
	picked: boolean;
	onPick: () => void;
}) {
	/**
	 * 🔑 A real cell with a face, not a number floating on the card.
	 *
	 * The grid is what makes a calendar readable: you find the 17th by counting
	 * squares, not by reading every number. Bare numerals on the card ground gave
	 * the eye nothing to count, so the month read as a list that happened to be
	 * arranged in rows.
	 */
	const roomy = height >= 40;
	return (
		<button
			type="button"
			onClick={onPick}
			aria-label={`${day.toLocaleDateString(undefined, {
				weekday: "long",
				day: "numeric",
				month: "long",
			})}${count ? `, ${count} booked` : ""}`}
			aria-pressed={picked}
			className={`flex min-w-0 border-0 outline-none ${
				roomy
					? "flex-col items-start justify-between p-1"
					: "flex-col items-center justify-center gap-[2px]"
			}`}
			style={{
				width,
				height,
				borderRadius: Math.max(3, Math.round(height * 0.14)),
				/* Days outside the month keep a face, just a quieter one. Dropping
				   their ground entirely punched holes in the grid and broke the
				   counting the grid exists for. */
				background: picked
					? "var(--face-control)"
					: outside
						? "transparent"
						: "var(--surface-recess)",
				boxShadow: picked
					? "inset 0 0 0 1px var(--chart-ink)"
					: today
						? "inset 0 0 0 1px var(--chart-ink)"
						: outside
							? "inset 0 0 0 1px var(--empty-line)"
							: "none",
			}}
		>
			<span
				className="tabular-nums leading-none"
				style={{
					fontSize: Math.max(9, Math.min(15, Math.round(height * 0.34))),
					color: outside
						? "var(--ink-25)"
						: today || picked
							? "var(--chart-ink)"
							: "var(--ink-75)",
				}}
			>
				{day.getDate()}
			</span>
			{/* ⚠️ A capped row of dots, not one per booking. Eleven dots in a cell
			    this size is a smear, and the question the grid answers is "is this
			    day busy", not "exactly how busy". The list underneath answers the
			    second one. */}
			<span className="flex h-[3px] w-full items-center gap-[2px]">
				{Array.from({ length: Math.min(count, roomy ? 4 : 3) }, (_, index) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: identical dots in a fixed length row, never reordered
						key={index}
						className="block h-[3px] w-[3px] shrink-0 rounded-full"
						style={{ background: "var(--chart-ink)" }}
					/>
				))}
			</span>
		</button>
	);
}

function DayList({
	items,
	picked,
	loading,
	beside,
	width,
}: {
	items: Booking[];
	picked: string | null;
	loading: boolean;
	/** Beside the grid on a card whose leftover space is width, not height. */
	beside: boolean;
	width: number;
}) {
	return (
		<div
			className={
				beside
					? "min-h-0 shrink-0 self-stretch overflow-y-auto"
					: "mt-2 min-h-0 w-full flex-1 overflow-y-auto"
			}
			style={beside ? { width } : undefined}
		>
			{loading ? null : items.length === 0 ? (
				<p className="text-[11px] text-[var(--ink-30)]">
					{picked ? "Nothing booked this day." : "Pick a day."}
				</p>
			) : (
				<ul className="flex flex-col gap-1">
					{items.map((item) => (
						<li key={item.id} className="flex items-baseline gap-2">
							<span className="shrink-0 text-[10.5px] text-[var(--ink-45)] tabular-nums">
								{clock(item.startsAt)}
							</span>
							<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-80)]">
								{item.title || item.clientName || "Booking"}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * What is coming up, for a tile too small to hold a month.
 *
 * ⚠️ It filters to the FUTURE. The grid's window reaches backwards to fill its
 * first week, and a list headed "next" that opens on last Tuesday is wrong in a
 * way a grid showing the same day is not.
 */
function Agenda({
	items,
	loading,
	compact,
}: {
	items: Booking[];
	loading: boolean;
	compact: boolean;
}) {
	const now = Date.now();
	const next = items
		.filter((item) => item.startsAt && new Date(item.startsAt).getTime() >= now)
		.slice(0, compact ? 1 : 6);

	if (loading) return null;
	if (next.length === 0) {
		return (
			<p className="text-[11.5px] text-[var(--ink-30)] leading-5">
				Nothing coming up.
			</p>
		);
	}
	return (
		<ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
			{next.map((item) => (
				<li key={item.id} className="flex items-baseline gap-2">
					<span className="shrink-0 text-[10.5px] text-[var(--ink-45)] tabular-nums">
						{stamp(item.startsAt)}
					</span>
					<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-80)]">
						{item.title || item.clientName || "Booking"}
					</span>
				</li>
			))}
		</ul>
	);
}

const clock = (iso: string | null) =>
	iso
		? new Date(iso).toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			})
		: "";

const stamp = (iso: string | null) =>
	iso
		? new Date(iso).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			})
		: "";
