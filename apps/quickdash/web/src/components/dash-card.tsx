import type { ReactNode } from "react";
import { useMeasure } from "./charts";

/**
 * The dashboard's building blocks.
 *
 * 🔑 One card component, used for every tile on Home. The page is a grid of the
 * same object at different sizes rather than a stack of bespoke sections — which
 * is what lets the layout be rearranged without anything being restyled, and
 * what makes the next dashboard look like this one for free.
 *
 * ⚠️ Charts are hand-drawn SVG, not a charting library. Everything here is a
 * series of at most a few dozen points with no interaction beyond a hover
 * readout; a library would add a bundle, its own theming, and a second set of
 * colour decisions that would then disagree with the console's tokens.
 */

export function Card({
	title,
	action,
	children,
	className = "",
}: {
	title?: string;
	/** Sits opposite the title. A range picker, a link to the full page. */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			/* `h-full`: in a bento the tile fills the cells it was given, so a
			   two-row card is genuinely twice the height rather than a short card
			   floating in a tall hole. */
			/* 🔴 `--lift-card`, not `--card-lift`.
			   Two tokens one letter apart: `--card-lift` is the original 2px drop
			   and `--lift-card` is the console's real relief, the lit top edge and
			   shaded underside every raised surface now shares. The dashboard was
			   still on the old one, which is why its cards read flat next to the
			   header.

			   ⚠️ NOT `--lift-pop`. That adds the long casts a floating panel needs;
			   a tile is resting on the page, and giving it the same drop would put
			   eight hovering rectangles on one screen.

			   🔴 `--surface-tile`, NOT the header's `--surface-card`.
			   The header is a light tray carrying lighter buttons. The outlet is a
			   near black plane and its cards rise out of THAT, so borrowing the
			   header's face put a bright slab on a dark floor. Four steps off the
			   ground: the relief does the work, not the brightness. */
			style={{ boxShadow: "var(--lift-card)" }}
			/* 🔴 `overflow-hidden`. Without it a chart that wanted more room than the
			   card had simply drew outside it: a one row tile put its bars on the
			   page BELOW the card. Whatever a child asks for, the card is the
			   boundary. */
			className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--console-line)] bg-[var(--surface-tile)] p-4 ${className}`}
		>
			{title || action ? (
				<div className="mb-3 flex min-w-0 items-center justify-between gap-3">
					{title ? (
						<p className="min-w-0 truncate text-[12px] text-[var(--ink-45)]">
							{title}
						</p>
					) : (
						<span />
					)}
					{action}
				</div>
			) : null}
			{children}
		</div>
	);
}

/**
 * A headline number.
 *
 * ⚠️ `tabular-nums` everywhere a figure can change. Without it the digits have
 * different widths, so a number that updates makes everything after it jump —
 * most visible on a dashboard, where several of them update at once.
 */
export function Stat({
	value,
	label,
	sub,
}: {
	value: string;
	label?: string;
	sub?: string;
}) {
	return (
		<div className="min-w-0">
			{label ? (
				<p className="mb-1 truncate text-[11.5px] text-[var(--ink-35)]">
					{label}
				</p>
			) : null}
			<p className="truncate text-[24px] text-[var(--ink-90)] leading-none tabular-nums">
				{value}
			</p>
			{sub ? (
				<p className="mt-1.5 truncate text-[11.5px] text-[var(--ink-35)]">
					{sub}
				</p>
			) : null}
		</div>
	);
}

/**
 * An area chart.
 *
 * 🔴 Drawn in a `viewBox` of fixed units with `preserveAspectRatio="none"`, so
 * the SVG stretches to whatever the card gives it without any measurement in
 * JavaScript. A chart that has to know its own pixel width needs a resize
 * observer, and then it redraws on every drag of the sidebar.
 *
 * ⚠️ `vector-effect="non-scaling-stroke"` on the line. Without it the stretch
 * that fits the chart to the card also stretches the stroke, so the line is
 * thicker horizontally than vertically and looks blurred.
 */
/**
 * ⚠️ The charts moved to `charts.tsx`. They were an SVG stretched to fit its
 * box, which cannot carry a label, cannot keep an aspect ratio, and overflowed
 * a short card — the bars from a one row tile drew on the page below it. The
 * replacements measure their box and draw in real pixels. `Area`, `Bars`,
 * `Donut` and `Series` all live there now.
 */
/**
 * A calendar heatmap: one cell per day, weeks as columns.
 *
 * 🔑 The shape answers a question the other charts cannot. A line says how
 * something moved; this says WHEN it happens — that Tuesdays carry the week,
 * that a fortnight went quiet, that weekends are dead. Traffic is the series
 * where that pattern is the whole point.
 *
 * ⚠️ Bucketed by DAY, not by hour, and that is a real limit rather than a
 * choice: the reports API takes `day | week | month`, so an hour-of-day grid
 * needs the API to learn a fourth granularity first. The data is there — every
 * event carries `occurred_at` — the endpoint just cannot ask for it yet.
 *
 * 🔴 Five steps, not a gradient. A continuous scale invites reading an exact
 * value off a colour, which nobody can do; five steps say "none, quiet, normal,
 * busy, busiest" and that is all anybody takes from a heatmap anyway.
 */
/** Names the padding cells before the first day, so they need no index key. */
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function Heatmap({
	days,
	/**
	 * 🔑 Fifty-three, a full year, like a contribution graph. Thirteen weeks was
	 * a quarter, which is long enough to see a trend and too short to see the
	 * shape of a business: whether December is dead, whether the summer carries
	 * it. A year is the span this chart exists for.
	 */
	weeks = 53,
}: {
	/** Newest last. One entry per day; gaps are treated as zero. */
	days: Array<{ date: string; value: number }>;
	weeks?: number;
}) {
	/**
	 * 🔴 MEASURED, like every other chart, and that was the whole problem.
	 *
	 * This drew a CSS grid of `aspect-square` cells, so the cell size came from
	 * the column width and the height was whatever seven of those added up to.
	 * A card too short simply had its bottom rows cut off, a card too wide grew
	 * squares the size of stamps, and no size ever fit: the one chart on the
	 * board that was not treated as a chart.
	 *
	 * Now the cell is derived from the box — the smaller of what the width and
	 * the height allow — so the grid always fits and stays square.
	 */
	const { ref, width, height } = useMeasure<HTMLDivElement>();

	/**
	 * 🔴 The CALENDAR is built here; the data is only looked up against it.
	 *
	 * The series arrives from the API with a bucket per day that HAD traffic —
	 * quiet days are simply absent, because there is nothing to aggregate. Laying
	 * those rows out directly drew one square per active day, so a workspace with
	 * traffic on forty days of the year got a grid forty squares long. It looked
	 * like a short heatmap; it was actually a calendar with every empty day
	 * silently deleted, which is the one thing a contribution graph must never
	 * do. The gaps ARE the information.
	 *
	 * So every day in the window gets a square whether or not anything happened,
	 * and a day with no row is a zero rather than a day that does not exist.
	 */
	const byDate = new Map(days.map((day) => [day.date.slice(0, 10), day.value]));
	const total = weeks * 7;
	const cells = Array.from({ length: total }, (_, index) => {
		const date = new Date();
		date.setHours(12, 0, 0, 0);
		date.setDate(date.getDate() - (total - 1 - index));
		const key = date.toISOString().slice(0, 10);
		return { date: key, value: byDate.get(key) ?? 0 };
	});

	const top = Math.max(...cells.map((d) => d.value), 1);
	/* The first column is padded so every row is one weekday, which is what
	   makes "Tuesdays are busy" readable down a row. */
	const lead = new Date(`${cells[0].date}T12:00:00`).getDay();
	const columns = Math.ceil((cells.length + lead) / 7);

	/**
	 * 🔴 The cell GROWS to fill the card, and is capped so it cannot become
	 * absurd.
	 *
	 * Seven days in a four column card is seven squares, and drawn at a fixed
	 * size they sat in the corner of an enormous empty tile looking like a
	 * rendering failure. The grid should use the room it was given whatever the
	 * range is — but a single week at 90px a cell would be a chessboard, so
	 * there is a ceiling as well as a floor.
	 */
	const gap = 3;
	/**
	 * 🔴 The cell is sized by HEIGHT, and the width is allowed to overflow.
	 *
	 * A year is 53 columns by 7 rows, a fixed 7.6:1 shape. Fitting all of it
	 * inside the card meant the cell could never be larger than a card-width
	 * divided by 53 — so a tall card got a small strip of squares with a third of
	 * itself empty underneath, which is what "shouldn't it scale up" is asking
	 * about. It cannot scale up AND stay inside; those are different charts.
	 *
	 * So it takes the height it is given and scrolls sideways, exactly as the
	 * previous QuickDash did and as a contribution graph does on a phone. The
	 * ceiling is high enough for a tall card and the floor keeps a small one
	 * legible.
	 */
	const MAX_CELL = 34;
	const legend = 16;
	// The key is dropped before the grid is: a heatmap with no scale still says
	// where the busy days are, a scale with no heatmap says nothing.
	const room = height - (height >= 96 ? legend : 0);
	const byHeight = (room - gap * 6) / 7;
	// ⚠️ Width is a FLOOR, not a ceiling: it keeps the whole year visible when
	// the card is wide enough, and is ignored when it is not.
	const byWidth = (width - gap * (columns - 1)) / columns;
	const cell = Math.floor(
		Math.max(3, Math.min(byHeight, MAX_CELL, Math.max(byWidth, 8))),
	);
	// Under three pixels a cell is not a square, it is a dot, and seven rows of
	// dots is noise. The card's own number carries the tile instead.
	const drawable = width > 0 && cell >= 3;

	/**
	 * 🔴 ONE scale, and zero is the bottom of it.
	 *
	 * A quiet day used to be painted `--empty-line`, which is a hairline colour
	 * chosen to be visible against a card — so on a dark theme it came out
	 * BRIGHTER than the accent at 24%, and the ramp ran backwards at the bottom:
	 * a day with nothing on it looked busier than a day with something. Every
	 * step now comes from the same mix, so the order is guaranteed by
	 * construction rather than by two colours happening to agree.
	 */
	const STEPS = [6, 24, 42, 62, 84];
	const shade = (value: number) => {
		const share = value / top;
		const level =
			value <= 0
				? 0
				: share > 0.75
					? 4
					: share > 0.5
						? 3
						: share > 0.25
							? 2
							: 1;
		return `color-mix(in srgb, var(--chart-ink) ${STEPS[level]}%, transparent)`;
	};

	return (
		<div
			ref={ref}
			className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1"
		>
			{drawable ? (
				<>
					{/* Scrolls sideways when a year is wider than the card, with the
					    scrollbar hidden and touch momentum on, the same treatment the
					    series charts use. */}
					<div className="min-w-0 overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<div
							className="grid w-max grid-flow-col"
							style={{
								gap,
								gridTemplateRows: `repeat(7, ${cell}px)`,
								gridAutoColumns: `${cell}px`,
							}}
						>
							{/* ⚠️ Keyed by the WEEKDAY these blanks stand for, not by index:
						    the count changes with the first day of the range, and an index
						    key makes React reuse the wrong cell when the range moves. */}
							{WEEKDAYS.slice(0, lead).map((weekday) => (
								<span key={`lead-${weekday}`} aria-hidden="true" />
							))}
							{cells.map((day) => (
								<span
									key={day.date}
									data-hint={`${new Date(day.date).toLocaleDateString(
										undefined,
										{
											weekday: "short",
											month: "short",
											day: "numeric",
										},
									)}: ${day.value.toLocaleString()}`}
									className="rounded-[2px]"
									style={{ background: shade(day.value) }}
								/>
							))}
						</div>
					</div>
					{height >= 96 ? (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-[var(--ink-25)]">Quiet</span>
							{/* ⚠️ The legend reads the SAME function the cells do. It used to
							    carry its own copy of the ramp, which is how the two drifted
							    apart the first time one of them changed. */}
							{STEPS.map((step, level) => (
								<span
									key={step}
									aria-hidden="true"
									className="size-2 rounded-[2px]"
									style={{
										background: shade(level === 0 ? 0 : (level / 4) * top),
									}}
								/>
							))}
							<span className="text-[10px] text-[var(--ink-25)]">Busy</span>
						</div>
					) : null}
				</>
			) : null}
		</div>
	);
}
