import type { ReactNode } from "react";
import { BAND_GAP, bandFit, HEAT_GAP, statFit } from "../lib/tile-fit";
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
						/* 🔴 `data-card-title`, so edit mode can indent it.
						   The board lays a drag grip and a remove button OVER the tile,
						   both 24px squares in the top corners, and they sat straight on
						   top of this line: "Seats" read as "ats" on every card while
						   editing. The tile knows nothing about the mode, so the board
						   reaches this one element by attribute rather than every tile
						   taking an `editing` prop. */
						<p
							data-card-title=""
							className="min-w-0 truncate text-[12px] text-[var(--ink-45)]"
						>
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
	/**
	 * 🔴 MEASURED, like the charts beside it, and this was the most visible gap
	 * on the whole board.
	 *
	 * The figure was a fixed 24px however large the card, so resizing a count
	 * card to four times the area produced the same small number in the corner of
	 * a much bigger empty rectangle. It is the most common tile there is, so
	 * "these do not scale" was mostly this one component.
	 *
	 * The arithmetic is in `statFit`, tested against every size the board can
	 * produce, because the cards are freely resizable and a fit that is only
	 * right at the default size is not a fit.
	 */
	const box = useMeasure<HTMLDivElement>();
	const fit = statFit(box.width, box.height, value.length, {
		label: Boolean(label),
		sub: Boolean(sub),
	});
	return (
		/*
		 * 🔴 The measured box and the content it sizes are DIFFERENT elements, and
		 * that separation is the whole point.
		 *
		 * Measuring the same box the text lives in is a loop with a delay in it:
		 * the size decides the font, the font changes the box, the observer fires,
		 * and the number flickers between two sizes forever. It survived review
		 * because a `flex-1` child looks like it has a height of its own — until a
		 * fractional layout, a zoomed webview, or one line of text appearing or
		 * disappearing nudges it by half a pixel.
		 *
		 * The outer element takes its size purely from the flex row it sits in.
		 * The inner one is absolutely positioned inside it, so nothing it contains
		 * can ever change what was measured.
		 */
		<div ref={box.ref} className="relative min-h-0 min-w-0 flex-1">
			<div className="absolute inset-0 flex flex-col justify-center overflow-hidden">
				{/* ⚠️ `fit.label`, not `label`. A card too short for the caption keeps the
			    NUMBER, which is the thing you glanced at, and drops the caption. The
			    fit decides that, because only the fit knows what fits. */}
				{label && fit.label ? (
					<p
						className="truncate text-[var(--ink-35)]"
						style={{ fontSize: fit.note, marginBottom: fit.gap }}
					>
						{label}
					</p>
				) : null}
				<p
					className="truncate text-[var(--ink-90)] leading-none tabular-nums"
					style={{ fontSize: fit.value }}
				>
					{value}
				</p>
				{sub && fit.sub ? (
					<p
						className="truncate text-[var(--ink-35)]"
						style={{ fontSize: fit.note, marginTop: fit.gap }}
					>
						{sub}
					</p>
				) : null}
			</div>
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
	/**
	 * 🔴 The year WRAPS into bands, and that is what finally made it scale.
	 *
	 * A year is 53 columns by 7 rows: a fixed 7.6 to 1 shape. Any tile that is
	 * not that shape strands space in one direction, and both previous attempts
	 * picked which direction to strand it in. Fitting the whole year meant a wide
	 * card of tiny squares with a third of itself empty underneath. Sizing by
	 * height and scrolling sideways meant a tall card showed two months.
	 *
	 * ⚠️ The code also contradicted its own comment: `min(byHeight, MAX_CELL,
	 * max(byWidth, 8))` uses width as a CEILING while the comment beside it said
	 * floor, so a tall narrow card was pinned to 8px cells however much room it
	 * had. That is the "why doesn't it scale" everybody could see.
	 *
	 * So the year is allowed to run onto a second or third band, the way a
	 * paragraph runs onto another line. Every candidate band count is measured
	 * and the one giving the largest cell wins, which fills a square tile, a wide
	 * strip and a tall column with the same code and no special cases.
	 */
	const legend = 16;
	// The key is dropped before the grid is: a heatmap with no scale still says
	// where the busy days are, a scale with no heatmap says nothing.
	const room = height - (height >= 96 ? legend : 0);

	/* The wrapping itself lives in `tile-fit`, tested against every card size the
	   board can produce, beside the ring and the figure that had the same
	   problem. See the note there. */
	const { bands, cell } = bandFit(width, room, columns);
	const perBand = Math.ceil(columns / bands);

	/**
	 * Under three pixels a cell is not a square, it is a dot, and seven rows of
	 * dots is noise.
	 *
	 * 🔴 It used to render NOTHING at that size: an empty card, which reads as
	 * broken rather than as small. Cutting detail out of a tile too small to hold
	 * it is right; leaving the tile blank is not. It falls back to the one number
	 * the chart is about, and the grid returns the moment the card can hold it.
	 */
	const drawable = width > 0 && cell >= 3;
	const sum = cells.reduce((count, day) => count + day.value, 0);

	/**
	 * The padded run of squares, lead blanks included, cut into bands.
	 *
	 * ⚠️ Cut by COLUMN, not by cell count, so every band starts on the same
	 * weekday and a row still reads straight across as "Tuesdays".
	 */
	const padded: Array<{ date: string; value: number } | null> = [
		...Array.from({ length: lead }, () => null),
		...cells,
	];
	const rows = Array.from({ length: bands }, (_, band) =>
		padded.slice(band * perBand * 7, (band + 1) * perBand * 7),
	);

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
					<div
						className="flex min-w-0 flex-col items-center"
						style={{ gap: BAND_GAP }}
					>
						{rows.map((band, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: bands are positional slices of one fixed run, never reordered
								key={index}
								className="grid grid-flow-col"
								style={{
									gap: HEAT_GAP,
									gridTemplateRows: `repeat(7, ${cell}px)`,
									gridAutoColumns: `${cell}px`,
								}}
							>
								{band.map((day, slot) =>
									day === null ? (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: a blank has no identity beyond its slot
											key={`blank-${index}-${slot}`}
											aria-hidden="true"
										/>
									) : (
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
									),
								)}
							</div>
						))}
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
			) : (
				<Stat value={sum.toLocaleString()} sub="in the last year" />
			)}
		</div>
	);
}
