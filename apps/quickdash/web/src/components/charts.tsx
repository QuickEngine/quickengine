import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MIN_PLOT, plotHeight } from "../lib/tile-fit";

/**
 * Every chart in QuickDash.
 *
 * ── Why this replaced the old ones ───────────────────────────────────────────
 *
 * 🔴 The first charts were an SVG with `viewBox="0 0 100 40"` and
 * `preserveAspectRatio="none"`, stretched to whatever box they landed in. That
 * is fine for a decorative sparkline and wrong for everything else:
 *
 * - Nothing could be LABELLED. Text in a non-uniformly stretched viewBox comes
 *   out squashed horizontally and stretched vertically, so no chart could carry
 *   an axis, and a chart with no axis is a shape rather than a measurement.
 * - A fixed `min-height` on the drawing meant a short card OVERFLOWED: the bars
 *   from a one-row tile rendered on the page below it, outside the card.
 * - The aspect ratio changed with the tile, so the same data read as a gentle
 *   slope in one size and a cliff in another.
 *
 * 🔑 So these measure their box and draw in REAL PIXELS. A line is one pixel
 * wherever it is, text is upright, and the chart knows how much room it has —
 * which is what lets it decide how much detail to show instead of drawing
 * something illegible.
 *
 * ── Room, and what to do without it ──────────────────────────────────────────
 *
 * ⚠️ A chart that cannot be read is worse than no chart: it takes the space a
 * number could have used and returns noise. Below `MIN_HEIGHT` these render
 * NOTHING and let the card's own figure carry the tile.
 */

const MIN_HEIGHT = MIN_PLOT;
/**
 * 🔴 A ceiling, not just a floor.
 *
 * A card dragged four rows tall gave its chart four rows of chart, and a line
 * across 400px of height is a cliff: the same data reads as far more dramatic
 * than it is, purely because somebody wanted a bigger card. Past this the chart
 * keeps its proportions and the card gets the rest as space.
 */
/** Under this, a chart drops its grid and labels and becomes a bare line. */
const DETAIL_HEIGHT = 96;
/** Under this, a bar series is too cramped for gaps between bars. */
const DETAIL_WIDTH = 220;

/** Width per point below which a series scrolls rather than crushes together. */
const MIN_POINT_WIDTH = 14;

export function useMeasure<T extends HTMLElement>() {
	const ref = useRef<T | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		/**
		 * ⚠️ A ResizeObserver, not a window listener. These live in a grid whose
		 * cells change size when a tile is dragged or the sidebar is resized,
		 * neither of which fires `resize` on the window.
		 */
		const observer = new ResizeObserver(([entry]) => {
			const box = entry.contentRect;
			const next = {
				width: Math.round(box.width),
				height: Math.round(box.height),
			};
			/**
			 * 🔴 Only when it actually MOVED, and by a whole pixel.
			 *
			 * Everything measured here sizes something from the result, so a report
			 * that is a fraction different from the last one can change a font size,
			 * nudge the layout, and be reported again: the card ends up flickering
			 * between two sizes for as long as it is on screen. A zoomed webview
			 * makes it likely rather than theoretical, because almost nothing lands
			 * on a whole pixel any more.
			 *
			 * ⚠️ This is a guard, not the fix. A component whose measured box is the
			 * box it sizes is broken however the report is filtered, and the answer
			 * there is to measure something the content cannot influence — see
			 * `Stat`. This stops one careless consumer taking the whole page with it.
			 */
			setSize((current) =>
				current.width === next.width && current.height === next.height
					? current
					: next,
			);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return { ref, ...size };
}

/**
 * Every shape a tile can be asked to draw.
 *
 * ⚠️ Stacked columns, stacked areas, combo and radar are deliberately ABSENT.
 * Every one of them plots two or more series against each other, and a
 * dashboard tile carries exactly one: revenue, or orders, or visitors. Offering
 * a stacked bar for a single series would draw one colour and call it a stack,
 * which is a picker lying about what it can do. They arrive when a tile has a
 * second series to compare — the split tiles in the audit are the first ones
 * that will.
 */
export type ChartKind =
	| "area"
	| "line"
	| "step"
	| "bars"
	| "rows"
	| "dots"
	| "donut"
	| "pie"
	| "gauge"
	| "candles"
	/**
	 * ⚠️ Drawn by `Heatmap` in `dash-card.tsx`, not by `Series`. It needs dated
	 * days rather than a bare list of numbers, so it cannot share the series
	 * signature — but it must live in this union, because the picker offers it
	 * and a tile-local string could never be typed through `TileSpec`.
	 */
	| "heat"
	/**
	 * 🔑 No chart at all, and it is a real choice rather than an absence.
	 *
	 * Several of these cards answer with one number, and a chart under it is
	 * decoration that costs the card its breathing room. Somebody who wants a
	 * wall of figures should be able to have one, and the only honest way to
	 * offer that is to make "none" a shape you can pick.
	 */
	| "none";

export const CHART_LABEL: Record<ChartKind, string> = {
	area: "Area",
	line: "Line",
	step: "Step",
	bars: "Columns",
	rows: "Bars",
	dots: "Dots",
	donut: "Donut",
	pie: "Pie",
	gauge: "Gauge",
	candles: "Candles",
	heat: "Heatmap",
	none: "None",
};

type SeriesProps = {
	kind: ChartKind;
	points: number[];
	/** One per point. Shown on the axis where there is room for them. */
	labels?: string[];
	/** Turns a value into what a person reads. Money, a count, a percentage. */
	format?: (value: number) => string;
};

/**
 * The box every chart is drawn into.
 *
 * 🔑 It measures, decides whether there is room, and scrolls sideways when the
 * series is denser than the space. That last part is how a ninety day chart
 * survives a phone: the same drawing, swiped, rather than ninety points crushed
 * into three hundred pixels. Same approach the previous QuickDash used, and the
 * one thing it got unambiguously right.
 */
function Frame({
	points,
	children,
}: {
	points: number;
	children: (size: { width: number; height: number }) => ReactNode;
}) {
	const { ref, width, height } = useMeasure<HTMLDivElement>();
	const needed = points * MIN_POINT_WIDTH;
	const scrolls = width > 0 && needed > width;

	return (
		<div
			ref={ref}
			/* `min-h-0` and `min-w-0`: without them a flex child refuses to shrink
			   below its content, which is exactly how the old charts escaped their
			   card. Nothing here is allowed to be bigger than what it was given. */
			className={`h-full min-h-0 w-full min-w-0 ${
				scrolls
					? "overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					: "overflow-hidden"
			}`}
		>
			{width > 0 && height >= MIN_HEIGHT ? (
				<div
					style={{
						width: scrolls ? needed : width,
						height: plotHeight(width, height),
					}}
				>
					{children({
						width: scrolls ? needed : width,
						height: plotHeight(width, height),
					})}
				</div>
			) : null}
		</div>
	);
}

/**
 * A smooth line through the readings.
 *
 * 🔴 Straight segments made every chart a series of hard angles: the shape of
 * the data was there but it read as a saw, and a dashboard is scanned rather
 * than studied. The reference everybody actually likes is a curve.
 *
 * 🔑 MONOTONE cubic, not Catmull-Rom or a plain cardinal spline. Those two are
 * smoother and will happily bulge past the values they connect — which on a
 * chart means a curve that dips below zero between two positive days, drawing a
 * loss that never happened. The Fritsch and Carlson tangents below are chosen
 * precisely so the curve never overshoots a reading: between two points it
 * stays between them.
 */
function smoothCurve(xs: number[], ys: number[]) {
	if (xs.length < 2) {
		const only = ys[0] ?? 0;
		return { path: `M ${xs[0] ?? 0} ${only}`, at: () => only };
	}
	const n = xs.length;
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		slope.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
	}

	const tangent: number[] = [slope[0]];
	for (let i = 1; i < n - 1; i++) {
		// A turning point gets a flat tangent, which is what stops the curve
		// rounding over a peak and inventing a higher one.
		tangent.push(
			slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2,
		);
	}
	tangent.push(slope[n - 2]);

	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) {
			tangent[i] = 0;
			tangent[i + 1] = 0;
			continue;
		}
		const a = tangent[i] / slope[i];
		const b = tangent[i + 1] / slope[i];
		const h = Math.hypot(a, b);
		if (h > 3) {
			tangent[i] = ((3 * a) / h) * slope[i];
			tangent[i + 1] = ((3 * b) / h) * slope[i];
		}
	}

	let path = `M ${xs[0]} ${ys[0]}`;
	for (let i = 0; i < n - 1; i++) {
		const dx = (xs[i + 1] - xs[i]) / 3;
		path += ` C ${xs[i] + dx} ${ys[i] + tangent[i] * dx} ${xs[i + 1] - dx} ${
			ys[i + 1] - tangent[i + 1] * dx
		} ${xs[i + 1]} ${ys[i + 1]}`;
	}

	/**
	 * 🔴 The curve's OWN height at an x, and this is what the cursor was missing.
	 *
	 * The readout used to interpolate linearly between two readings while the
	 * line was drawn as a cubic. Everywhere the curve bulged away from the
	 * straight line between two points — which is everywhere, that being the
	 * point of a curve — the dot floated above or below the line it was meant to
	 * be riding. Evaluating the same Hermite basis the path is built from means
	 * the marker is ON the line by construction rather than by luck.
	 */
	const at = (x: number) => {
		if (x <= xs[0]) return ys[0];
		if (x >= xs[n - 1]) return ys[n - 1];
		let i = 0;
		while (i < n - 2 && xs[i + 1] < x) i++;
		const h = xs[i + 1] - xs[i] || 1;
		const t = (x - xs[i]) / h;
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			(2 * t3 - 3 * t2 + 1) * ys[i] +
			(t3 - 2 * t2 + t) * h * tangent[i] +
			(-2 * t3 + 3 * t2) * ys[i + 1] +
			(t3 - t2) * h * tangent[i + 1]
		);
	};

	return { path, at };
}

/**
 * Where a value sits vertically, in pixels, with room for the stroke.
 *
 * 🔴 `zeroed` decides whether the axis starts at zero, and it is the difference
 * between a readable chart and a flat line.
 *
 * A business quantity is measured FROM nothing: revenue of £400 against a day
 * of £0 is the comparison somebody wants, so the axis includes zero and the
 * bars are honestly proportional. A PRICE is not — Bitcoin has never been worth
 * nothing, and forcing zero into the range put a day that moved between $77,994
 * and $78,190 inside an axis spanning $0 to $78,190. The entire day's movement
 * was a quarter of one percent of the height, which drew as a perfectly flat
 * line. Correct arithmetic, useless chart.
 *
 * ⚠️ So bars stay zeroed, because a bar starting anywhere else lies about
 * proportion, and price shapes fit the data they actually have.
 */
function scale(points: number[], height: number, pad: number, zeroed = true) {
	const high = Math.max(...points, zeroed ? 1 : -Infinity);
	const low = zeroed ? Math.min(...points, 0) : Math.min(...points);
	// A flat series would divide by zero; give it a little air either side so
	// the line sits in the middle rather than on an edge.
	const span = high - low || Math.abs(high) * 0.02 || 1;
	const usable = height - pad * 2;
	return (value: number) => pad + usable - ((value - low) / span) * usable;
}

/**
 * A grid, and the numbers down its side.
 *
 * 🔑 Three lines, not ten. A chart in a dashboard tile is read for its SHAPE
 * and its rough level; a dense grid turns it into a table nobody can read at
 * this size. Reference points at the bottom, middle and top are enough to say
 * "about a thousand" without pretending to precision.
 */
/** The drawing width once the value column is taken out. */
const GUTTER = 46;

function Grid({
	width,
	height,
	points,
	pad,
	format,
}: {
	width: number;
	height: number;
	points: number[];
	pad: number;
	format?: (value: number) => string;
}) {
	const top = Math.max(...points, 1);
	const at = scale(points, height, pad);
	return (
		<>
			{[0, 0.5, 1].map((share) => {
				const y = at(top * share);
				return (
					<g key={share}>
						<line
							x1="0"
							x2={format ? width - GUTTER : width}
							y1={y}
							y2={y}
							stroke="var(--console-line)"
							strokeWidth="1"
						/>
						{/* 🔴 In a GUTTER on the right, not floated over the drawing.
						    Numbers sitting on the plot land on top of the line they
						    describe, and the topmost one — the biggest, the one being
						    read — is exactly where the data usually is. Every terminal
						    reserves a column for this and they are all right. */}
						{format ? (
							<text
								x={width - GUTTER + 5}
								y={y + 3}
								fontSize="9"
								fill="var(--ink-30)"
							>
								{format(top * share)}
							</text>
						) : null}
					</g>
				);
			})}
		</>
	);
}

function Path({
	points,
	labels,
	format,
	kind,
	width,
	height,
}: SeriesProps & { width: number; height: number }) {
	// Declared before the drawing so the readout can sit over it.
	/**
	 * ⚠️ There is no separate "spark" any more. It was a line without a grid or
	 * labels, which is exactly what a line already becomes when the card is too
	 * short for them — so the picker offered the same drawing twice under two
	 * names. Detail follows the room; it is not a choice.
	 */
	/* ⚠️ Width as well as height. The bar series already tested both; this one
	   did not, so a narrow tall card reserved a 46px gutter out of 178px and gave
	   a quarter of itself to axis numbers nobody asked for. */
	const detailed = height >= DETAIL_HEIGHT && width >= DETAIL_WIDTH;
	// Room at the top for the highest gridline's label, and at the foot for the
	// day names when they are shown.
	const pad = detailed ? 10 : 3;
	const bottom = detailed && labels ? 14 : 0;
	const plotHeight = height - bottom;
	const at = scale(points, plotHeight, pad);
	// The plot stops at the gutter, so the last point sits beside its own label
	// rather than underneath it.
	const plotWidth = detailed && format ? width - GUTTER : width;
	const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;

	/**
	 * A step holds its level until the next reading, which is the honest shape
	 * for anything counted once a day rather than measured continuously: a
	 * sloped line between Monday and Tuesday claims a Monday afternoon value
	 * that was never recorded.
	 */
	const curve = smoothCurve(
		points.map((_, index) => index * step),
		points.map((value) => at(value)),
	);
	const line =
		kind === "step"
			? points
					.map((value, index) =>
						index === 0
							? `M 0 ${at(value)}`
							: `L ${index * step} ${at(points[index - 1])} L ${index * step} ${at(value)}`,
					)
					.join(" ")
			: curve.path;

	/**
	 * The reading under the pointer.
	 *
	 * 🔴 A chart on a dashboard gets asked one question over and over: what was
	 * it ON THAT DAY. Without this the answer is to squint at a gridline and
	 * guess, which is the difference between a picture of the data and the data.
	 *
	 * ⚠️ Held in state rather than drawn on a canvas, because the readout is
	 * ordinary DOM: it inherits the theme, wraps properly and is legible at any
	 * size, none of which is true of text inside an SVG.
	 */
	const [held, setHeld] = useState<number | null>(null);

	/**
	 * 🔴 The POINTER's offset, not the nearest reading's index.
	 *
	 * Snapping the whole cursor to one of seven readings meant a chart four
	 * hundred pixels wide gave seven answers and the readout teleported between
	 * them. Keeping the raw offset lets everything move with the hand.
	 */
	const track = (event: React.PointerEvent<SVGSVGElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		setHeld(Math.max(0, Math.min(width, event.clientX - box.left)));
	};

	/**
	 * The reading under the pointer, between two days if that is where it is.
	 *
	 * ⚠️ INTERPOLATED, and that is a deliberate claim rather than an oversight.
	 * A line chart already asserts a continuous quantity: the curve between
	 * Monday and Tuesday is drawn, so reading a value off it agrees with what is
	 * on screen. The label still names the nearest real day, so nobody is shown
	 * a Tuesday figure while pointing at Wednesday.
	 *
	 * 🔑 A step chart is exempt. A step exists to say the value did NOT move
	 * between readings, so interpolating one would contradict the shape somebody
	 * chose it for.
	 */
	const cursor = (() => {
		if (held === null || points.length === 0) return null;
		const x = Math.min(Math.max(held, 0), width);
		const exact = step > 0 ? x / step : 0;
		const left = Math.max(0, Math.min(points.length - 1, Math.floor(exact)));
		const right = Math.min(points.length - 1, left + 1);
		const share = kind === "step" ? 0 : exact - left;
		return {
			x,
			/**
			 * 🔑 `y` comes from the DRAWING, `value` from the data.
			 *
			 * They are not the same question. The marker has to sit on the curve
			 * that is on screen, and the readout has to say a number that is true;
			 * using one for both is what put the dot off the line. A step chart
			 * holds its level, so its marker follows the level rather than a curve
			 * it does not draw.
			 */
			y: kind === "step" ? at(points[left]) : curve.at(x),
			value: points[left] + (points[right] - points[left]) * share,
			label: labels?.[Math.round(exact)] ?? labels?.[left],
		};
	})();

	return (
		<div className="relative" style={{ width, height }}>
			{/* 🔑 The readout is DOM over the drawing, not text inside it. SVG text
		    does not wrap, does not inherit the type scale, and cannot carry a
		    background that respects the theme. */}
			{cursor ? (
				<div
					/**
					 * 🔴 BESIDE the marker, never over it.
					 *
					 * Centred on the cursor, the readout sat on the dot and the line it
					 * was describing, so reading the number meant covering the thing the
					 * number was about. It offsets to whichever side has room, flipping
					 * left as the pointer nears the right edge, and drops below the
					 * marker when the curve is near the top.
					 */
					style={{
						left: cursor.x + (cursor.x > width - 110 ? -12 : 12),
						top: Math.min(
							Math.max(2, cursor.y - (cursor.y < 52 ? -14 : 46)),
							Math.max(2, height - 44),
						),
						transform: cursor.x > width - 110 ? "translateX(-100%)" : undefined,
					}}
					className="pointer-events-none absolute z-10 rounded-lg bg-[var(--console-pop)] px-2 py-1 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
				>
					{cursor.label ? (
						<span className="block text-[9.5px] text-[var(--ink-35)]">
							{cursor.label}
						</span>
					) : null}
					<span className="block whitespace-nowrap text-[12px] text-[var(--ink-90)] tabular-nums">
						{format
							? format(cursor.value)
							: Math.round(cursor.value).toLocaleString()}
					</span>
				</div>
			) : null}
			<svg
				width={width}
				height={height}
				className="block touch-none"
				role="img"
				aria-label="Trend"
				onPointerMove={track}
				onPointerDown={track}
				onPointerLeave={() => setHeld(null)}
			>
				{detailed ? (
					<Grid
						width={width}
						height={plotHeight}
						points={points}
						pad={pad}
						format={format}
					/>
				) : null}

				{kind === "area" ? (
					<>
						<defs>
							<linearGradient id="chart-wash" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="0%"
									stopColor="var(--chart-ink)"
									stopOpacity="0.28"
								/>
								<stop
									offset="100%"
									stopColor="var(--chart-ink)"
									stopOpacity="0"
								/>
							</linearGradient>
						</defs>
						<path
							d={`${line} L ${plotWidth} ${plotHeight} L 0 ${plotHeight} Z`}
							fill="url(#chart-wash)"
						/>
					</>
				) : null}

				<path
					d={line}
					fill="none"
					stroke="var(--chart-ink)"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				{/* 🔑 A dot on the last reading, or on whatever is being pointed at. On a
			    dashboard the question is almost always "where are we now", so that
			    is where it rests; while somebody is scrubbing, it follows them. */}
				{points.length > 0 ? (
					<>
						{cursor ? (
							<line
								x1={cursor.x}
								x2={cursor.x}
								y1={0}
								y2={plotHeight}
								stroke="var(--chart-ink)"
								strokeOpacity="0.35"
								strokeWidth="1"
							/>
						) : null}
						{/* The dot RIDES the line rather than hopping between readings,
						    so the eye can follow it. At rest it sits on the latest. */}
						<circle
							cx={cursor ? cursor.x : (points.length - 1) * step}
							cy={cursor ? cursor.y : at(points[points.length - 1])}
							r={cursor ? 3.5 : 2.5}
							fill="var(--chart-ink)"
							stroke="var(--console-card)"
							strokeWidth={cursor ? 1.5 : 0}
						/>
					</>
				) : null}

				{detailed && labels
					? labels.map((label, index) =>
							// Only the ends and the middle: a label under every point is a
							// smear at this width.
							index === 0 ||
							index === labels.length - 1 ||
							index === Math.floor(labels.length / 2) ? (
								<text
									key={label}
									x={Math.min(Math.max(index * step, 10), plotWidth - 10)}
									y={height - 3}
									textAnchor={
										index === 0
											? "start"
											: index === labels.length - 1
												? "end"
												: "middle"
									}
									fontSize="9"
									fill="var(--ink-25)"
								>
									{label}
								</text>
							) : null,
						)
					: null}
			</svg>
		</div>
	);
}

function Columns({
	points,
	labels,
	format,
	width,
	height,
}: SeriesProps & { width: number; height: number }) {
	const [held, setHeld] = useState<number | null>(null);
	const detailed = height >= DETAIL_HEIGHT && width >= DETAIL_WIDTH;
	const pad = detailed ? 10 : 2;
	const bottom = detailed && labels ? 14 : 0;
	const plotHeight = height - bottom;
	const top = Math.max(...points, 1);
	const gap = points.length > 24 ? 1 : 3;
	const barWidth = Math.max(
		1,
		(width - gap * (points.length - 1)) / points.length,
	);

	const slot = barWidth + gap;
	const track = (event: React.PointerEvent<SVGSVGElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		setHeld(
			Math.max(
				0,
				Math.min(
					points.length - 1,
					Math.floor((event.clientX - box.left) / (slot || 1)),
				),
			),
		);
	};

	return (
		<div className="relative" style={{ width, height }}>
			{/* The same readout the line charts carry: a bar chart is asked the same
		    question, and answering it only on one shape would make the picker a
		    choice about whether the chart works. */}
			{held !== null ? (
				<div
					/* Beside the bar, not over it. See the line chart's note. */
					style={{
						left:
							held * slot +
							barWidth / 2 +
							(held * slot > width - 110 ? -12 : 12),
						top: Math.max(
							2,
							plotHeight -
								Math.max(2, (points[held] / top) * (plotHeight - pad)) -
								44,
						),
						transform:
							held * slot > width - 110 ? "translateX(-100%)" : undefined,
					}}
					className="pointer-events-none absolute z-10 rounded-lg bg-[var(--console-pop)] px-2 py-1 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
				>
					{labels?.[held] ? (
						<span className="block text-[9.5px] text-[var(--ink-35)]">
							{labels[held]}
						</span>
					) : null}
					<span className="block whitespace-nowrap text-[12px] text-[var(--ink-90)] tabular-nums">
						{format ? format(points[held]) : points[held].toLocaleString()}
					</span>
				</div>
			) : null}
			<svg
				width={width}
				height={height}
				className="block touch-none"
				role="img"
				aria-label="Totals"
				onPointerMove={track}
				onPointerDown={track}
				onPointerLeave={() => setHeld(null)}
			>
				{detailed ? (
					<Grid
						width={width}
						height={plotHeight}
						points={points}
						pad={pad}
						format={format}
					/>
				) : null}
				{points.map((value, index) => {
					const usable = plotHeight - pad;
					// ⚠️ A floor of two pixels, so a day with nothing is a visible tick
					// rather than a gap. A missing bar reads as missing DATA; a flat one
					// reads as a quiet day, which is what it is.
					const barHeight = Math.max(2, (value / top) * usable);
					return (
						<rect
							key={labels?.[index] ?? index}
							x={index * (barWidth + gap)}
							y={plotHeight - barHeight}
							width={barWidth}
							height={barHeight}
							rx={Math.min(2, barWidth / 3)}
							fill="var(--chart-ink)"
							// The bar under the pointer comes forward; the rest step back,
							// which is what makes it obvious which one is being read.
							fillOpacity={held === null ? 0.55 : held === index ? 0.95 : 0.3}
						/>
					);
				})}
				{detailed && labels
					? labels.map((label, index) =>
							index === 0 || index === labels.length - 1 ? (
								<text
									key={label}
									x={index === 0 ? 0 : width}
									y={height - 3}
									textAnchor={index === 0 ? "start" : "end"}
									fontSize="9"
									fill="var(--ink-25)"
								>
									{label}
								</text>
							) : null,
						)
					: null}
			</svg>
		</div>
	);
}

/**
 * A ring or a wheel, for a series read as PARTS OF A WHOLE.
 *
 * ⚠️ Wrong for a time series, and the tiles say so rather than the picker: seven
 * days as a donut claims "Tuesday was 18% of the week", which is arithmetic
 * nobody wants and hides the trend the days actually carry.
 *
 * 🔴 Six slices at most, the rest gathered. A ring of twenty is a colour key.
 */
function Wheel({
	points,
	labels,
	hollow,
	width,
	height,
}: {
	points: number[];
	labels?: string[];
	hollow: boolean;
	width: number;
	height: number;
}) {
	const slices = points
		.map((value, index) => ({
			label: labels?.[index] ?? `#${index + 1}`,
			value,
		}))
		.filter((slice) => slice.value > 0)
		.sort((a, b) => b.value - a.value);
	const shown = slices.slice(0, 5);
	const rest = slices.slice(5).reduce((sum, slice) => sum + slice.value, 0);
	const parts =
		rest > 0 ? [...shown, { label: "Everything else", value: rest }] : shown;
	const total = parts.reduce((sum, slice) => sum + slice.value, 0) || 1;

	/**
	 * 🔴 The legend chooses a SIDE, and it is never dropped.
	 *
	 * It used to appear only when the card was wide enough to put it beside the
	 * ring, so a tall narrow tile showed a wheel of unnamed slices: a chart whose
	 * whole subject is which part is which, with the which-is-which removed. Now
	 * a wide box puts it alongside and a tall one puts it underneath, and the
	 * ring gives up whatever room that takes.
	 */
	const beside = width >= height * 1.5;
	const ringBox = beside
		? Math.min(height, width * 0.42)
		: Math.min(
				width,
				Math.max(40, height - Math.min(parts.length, 4) * 16 - 6),
			);
	const size = Math.max(28, ringBox);
	const radius = size / 2 - 1;
	const stroke = hollow ? radius * 0.42 : radius;
	const ring = radius - stroke / 2;
	const circumference = 2 * Math.PI * ring;
	/**
	 * ⚠️ How many rows actually FIT, rather than all of them. Six names in a
	 * short card overflow it, and the answer is not a scrollbar inside a
	 * dashboard tile: the largest slices are the ones anybody reads, and the rest
	 * are already gathered into "Everything else" above.
	 */
	const rows = beside
		? Math.max(1, Math.floor(height / 16))
		: Math.max(1, Math.floor((height - size - 6) / 16));
	let offset = 0;

	return (
		<div
			className={`flex h-full min-w-0 gap-2 ${
				beside ? "items-center" : "flex-col items-center justify-center"
			}`}
		>
			<svg
				width={size}
				height={size}
				className="block shrink-0"
				role="img"
				aria-label="Split"
			>
				{parts.map((slice, index) => {
					const dash = (slice.value / total) * circumference;
					const element = (
						<circle
							key={slice.label}
							cx={size / 2}
							cy={size / 2}
							r={ring}
							fill="transparent"
							stroke="var(--chart-ink)"
							strokeOpacity={1 - index * 0.15}
							strokeWidth={stroke}
							strokeDasharray={`${dash} ${circumference - dash}`}
							strokeDashoffset={-offset}
							transform={`rotate(-90 ${size / 2} ${size / 2})`}
						/>
					);
					offset += dash;
					return element;
				})}
			</svg>
			<ul
				className={`flex min-w-0 flex-col gap-1 overflow-hidden ${
					beside ? "flex-1" : "w-full"
				}`}
			>
				{parts.slice(0, rows).map((slice, index) => (
					<li key={slice.label} className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-[2px]"
							style={{
								background: "var(--chart-ink)",
								opacity: 1 - index * 0.15,
							}}
						/>
						<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-55)]">
							{slice.label}
						</span>
						<span className="shrink-0 text-[11px] text-[var(--ink-35)] tabular-nums">
							{Math.round((slice.value / total) * 100)}%
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * Bars lying down, for series whose labels are NAMES rather than dates.
 *
 * 🔑 The reason to have both: a vertical bar gets as much width as the tile
 * divided by the point count, which is fine for seven days and useless for
 * "Top products", where the label is a product name that needs a line of its
 * own. Lying down, every row has the full width to say what it is.
 */
function Rows({
	points,
	labels,
	format,
	width,
	height,
}: SeriesProps & { width: number; height: number }) {
	const top = Math.max(...points, 1);
	const ranked = points
		.map((value, index) => ({
			value,
			label: labels?.[index] ?? `#${index + 1}`,
		}))
		.sort((a, b) => b.value - a.value)
		// However tall the card is, a row under about 18px is unreadable, so the
		// chart shows what fits and stops rather than shrinking into a smear.
		.slice(0, Math.max(1, Math.floor(height / 22)));

	return (
		<div
			className="flex h-full flex-col justify-center gap-1.5"
			style={{ width }}
		>
			{ranked.map((row) => (
				<div key={row.label} className="flex items-center gap-2">
					<span className="w-[38%] shrink-0 truncate text-[11px] text-[var(--ink-55)]">
						{row.label}
					</span>
					<span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--chart-ink)_12%,transparent)]">
						<span
							className="absolute inset-y-0 left-0 rounded-[3px]"
							style={{
								width: `${Math.max(2, (row.value / top) * 100)}%`,
								background: "var(--chart-ink)",
								opacity: 0.62,
							}}
						/>
					</span>
					{format ? (
						<span className="shrink-0 text-[10.5px] text-[var(--ink-35)] tabular-nums">
							{format(row.value)}
						</span>
					) : null}
				</div>
			))}
		</div>
	);
}

/**
 * One point per reading, no line between them.
 *
 * 🔑 Honest where a line would lie. A line claims the value moved smoothly
 * between two readings; for something counted once a day, nothing happened in
 * between and the slope is invented. Dots say only what was measured.
 */
function Dots({
	points,
	labels,
	format,
	width,
	height,
}: SeriesProps & { width: number; height: number }) {
	const detailed = height >= DETAIL_HEIGHT;
	const pad = detailed ? 10 : 3;
	const at = scale(points, height, pad);
	const step = points.length > 1 ? width / (points.length - 1) : width;
	return (
		<svg
			width={width}
			height={height}
			className="block"
			role="img"
			aria-label="Readings"
		>
			{detailed ? (
				<Grid
					width={width}
					height={height}
					points={points}
					pad={pad}
					format={format}
				/>
			) : null}
			{/* ⚠️ Keyed by the LABEL where there is one. Two days with the same
			    reading produce the same computed key, and React then reuses the
			    wrong node when the range moves. */}
			{points.map((value, index) => (
				<circle
					key={labels?.[index] ?? `at-${index}`}
					cx={index * step}
					cy={at(value)}
					r={points.length > 40 ? 1.6 : 2.6}
					fill="var(--chart-ink)"
					fillOpacity={0.8}
				/>
			))}
		</svg>
	);
}

/**
 * A ring showing one number against its own best.
 *
 * ⚠️ It plots the LAST reading against the highest in the range, which is the
 * only whole a single series carries. Anything else would need a target, and a
 * gauge against an invented target is a chart that flatters or scolds for no
 * reason.
 */
function Gauge({
	points,
	format,
	width,
	height,
}: SeriesProps & { width: number; height: number }) {
	const latest = points[points.length - 1] ?? 0;
	const top = Math.max(...points, 1);
	const share = Math.max(0, Math.min(1, latest / top));
	const size = Math.min(width, height);
	const stroke = Math.max(4, size * 0.1);
	const ring = size / 2 - stroke / 2 - 1;
	const circumference = 2 * Math.PI * ring;

	return (
		<div className="flex h-full items-center justify-center" style={{ width }}>
			<svg
				width={size}
				height={size}
				className="block"
				role="img"
				aria-label="Against the best in this range"
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={ring}
					fill="none"
					stroke="var(--chart-ink)"
					strokeOpacity="0.14"
					strokeWidth={stroke}
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={ring}
					fill="none"
					stroke="var(--chart-ink)"
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={`${share * circumference} ${circumference}`}
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
				/>
				{size >= 72 ? (
					<text
						x={size / 2}
						y={size / 2 + 4}
						textAnchor="middle"
						fontSize={Math.round(size * 0.16)}
						fill="var(--ink-85)"
					>
						{format ? format(latest) : Math.round(share * 100)}
					</text>
				) : null}
			</svg>
		</div>
	);
}

/**
 * The price scale, in its own column on the right.
 *
 * 🔑 Five reference lines rather than the three a dashboard tile gets. A price
 * chart is read for the LEVEL as much as the shape — "is it above a hundred" is
 * the question — and three lines is not enough resolution to answer it.
 *
 * 🔴 The latest price gets a filled pill, because it is the one number on the
 * chart somebody is actually looking for. Every trading terminal does this and
 * they are all right about it.
 */
function PriceAxis({
	plotWidth,
	width,
	height,
	values,
	at,
	latest,
	format,
}: {
	plotWidth: number;
	width: number;
	height: number;
	values: number[];
	at: (value: number) => number;
	latest: number;
	format?: (value: number) => string;
}) {
	const high = Math.max(...values);
	const low = Math.min(...values);
	const lines = [0, 0.25, 0.5, 0.75, 1].map(
		(share) => low + (high - low) * share,
	);
	const say = (value: number) =>
		format
			? format(value)
			: value.toLocaleString(undefined, { maximumFractionDigits: 2 });
	const pill = at(latest);
	const onScreen = latest >= low && latest <= high;

	return (
		<>
			{lines.map((value) => (
				<g key={value}>
					<line
						x1="0"
						x2={plotWidth}
						y1={at(value)}
						y2={at(value)}
						stroke="var(--console-line)"
						strokeWidth="1"
						strokeDasharray="2 4"
					/>
					<text
						x={plotWidth + 6}
						y={at(value) + 3}
						fontSize="9"
						fill="var(--ink-30)"
					>
						{say(value)}
					</text>
				</g>
			))}
			{onScreen ? (
				<>
					<rect
						x={plotWidth + 2}
						y={pill - 7}
						width={width - plotWidth - 4}
						height="14"
						rx="3"
						fill="var(--chart-ink)"
						fillOpacity="0.9"
					/>
					<text
						x={plotWidth + 6}
						y={pill + 3}
						fontSize="9"
						fill="var(--console-bg)"
						fontWeight="600"
					>
						{say(latest)}
					</text>
				</>
			) : null}
			<line
				x1={plotWidth}
				x2={plotWidth}
				y1="0"
				y2={height}
				stroke="var(--console-line)"
				strokeWidth="1"
			/>
		</>
	);
}

/**
 * Dates along the foot.
 *
 * ⚠️ It labels where the DAY CHANGES, not every nth candle. Evenly spaced ticks
 * on an hourly chart produce "14:00, 18:00, 22:00, 02:00" with no indication
 * which day any of them belong to; a label when the date turns over is what
 * makes a multi-day window readable, and is what a terminal does.
 */
function TimeAxis({
	candles,
	step,
	plotWidth,
	height,
}: {
	candles: Candle[];
	step: number;
	plotWidth: number;
	height: number;
}) {
	const marks: Array<{ x: number; label: string }> = [];
	let previous = "";
	// At most one label every 60px, or they collide into a smear.
	let lastX = -Infinity;
	for (const [index, candle] of candles.entries()) {
		const day = candle.label;
		const x = index * step + step / 2;
		if (day !== previous && x - lastX > 60 && x < plotWidth - 20) {
			marks.push({ x, label: day });
			lastX = x;
		}
		previous = day;
	}
	return (
		<>
			{marks.map((mark) => (
				<text
					key={mark.label}
					x={mark.x}
					y={height - 4}
					textAnchor="middle"
					fontSize="9"
					fill="var(--ink-30)"
				>
					{mark.label}
				</text>
			))}
		</>
	);
}

/**
 * Open, high, low, close — a candle per bucket.
 *
 * ── Why a business dashboard has candlesticks ────────────────────────────────
 *
 * 🔑 Not because it looks like a trading terminal. A line plots one number per
 * day and throws the rest away; a candle keeps four, and the three it adds are
 * ones a shop actually cares about:
 *
 * - **Range.** A day that took £4,000 in a single order is a different day from
 *   one that took £4,000 across two hundred, and a line draws them identically.
 * - **Direction within the bucket.** Opened low and climbed, or opened high and
 *   fell away. On a weekly bucket that is the difference between a good week and
 *   a week that ended badly.
 * - **Volatility.** Long wicks say the number is unreliable, which is the honest
 *   warning before somebody forecasts from it.
 *
 * 🔴 Web3 is the other half of it, and it is not decoration. A workspace selling
 * in a token has a price that moves between the sale and the settlement, and
 * "what was this worth when it landed" is a range, not a point. The same shape
 * that shows a volatile trading day shows a volatile settlement day. Building it
 * now means the surface exists before the module needs it.
 *
 * ⚠️ It needs FOUR values per bucket, so a tile has to offer them. A tile with
 * one number per day cannot be drawn this way, and the picker only shows this
 * shape where the data has the shape. That is why `points` alone is not enough
 * and there is a separate `candles` prop.
 */
export type Candle = {
	label: string;
	open: number;
	high: number;
	low: number;
	close: number;
};

/** The drawing width once the price column is taken out. See `PriceAxis`. */
const plotWidthFor = (width: number, height: number) =>
	Math.max(10, width - (height >= DETAIL_HEIGHT ? 52 : 0));

function Candles({
	candles,
	format,
	width,
	height,
}: {
	candles: Candle[];
	format?: (value: number) => string;
	width: number;
	height: number;
}) {
	const [held, setHeld] = useState<number | null>(null);
	/**
	 * How much of the history is on screen, and where it starts.
	 *
	 * 🔴 A price chart is not one picture, it is a VIEW onto a series. Drawing
	 * every candle at once means a thousand of them at half a pixel each, and
	 * drawing only the last thirty means the rest may as well not have been
	 * fetched. Zoom decides how much, pan decides which part, and both are
	 * ordinary state rather than anything clever.
	 *
	 * ⚠️ `end` is measured from the NEWEST candle backwards, so the chart stays
	 * pinned to the present when the feed refreshes. Anchoring to an index from
	 * the start would make every new candle shift the view out from under
	 * somebody's hand.
	 */
	const [zoom, setZoom] = useState(60);
	const [end, setEnd] = useState(0);
	/**
	 * How far the price axis is stretched beyond fitting the visible candles.
	 *
	 * 🔴 1 means AUTO, which is what every terminal ships and what this chart
	 * already did: the price scale fits whatever bars are on screen, so zooming
	 * the time axis re-fits the price without being asked. Scrolling the price
	 * gutter overrides that, as dragging TradingView's does, and a double click
	 * puts it back — an override with no way home is a trap.
	 *
	 * ⚠️ It stretches about the MIDPOINT of the visible range. Zooming a price
	 * axis asks for more or less room around what you are looking at; anchoring
	 * anywhere else slides the candles off the top or bottom as you scroll.
	 */
	const [priceZoom, setPriceZoom] = useState(1);
	const drag = useRef<{ x: number; end: number } | null>(null);

	/**
	 * 🔴 How far out you can zoom is set by LEGIBILITY, not by how much history
	 * was fetched.
	 *
	 * A thousand candles across nineteen hundred pixels is under two pixels each:
	 * bodies merge, wicks merge with their neighbours' bodies, and the chart
	 * becomes a purple smear that says nothing. Any chart that lets you reach
	 * that has a broken zoom, not a lot of data. Below about three and a half
	 * pixels a candle stops being a candle, so that is the floor, and past it the
	 * gesture is to PAN rather than to keep zooming out.
	 *
	 * ⚠️ Computed from the plot width, so a wide card genuinely shows more than a
	 * narrow one instead of both being capped at the same count.
	 */
	const widest = Math.max(8, Math.floor(plotWidthFor(width, height) / 3.5));
	const visible = Math.max(8, Math.min(zoom, candles.length, widest));
	const offset = Math.max(0, Math.min(end, candles.length - visible));
	const shownCandles = candles.slice(
		Math.max(0, candles.length - visible - offset),
		candles.length - offset,
	);

	const detailed = height >= DETAIL_HEIGHT;
	const pad = detailed ? 10 : 3;
	const bottom = detailed ? 16 : 0;
	/**
	 * 🔑 A real GUTTER for the price, not numbers floated over the drawing.
	 *
	 * Prices on a trading chart sit in their own column on the right, and the
	 * reason is practical rather than stylistic: over the plot they land on top
	 * of candles, and the most recent price — the one everybody is actually
	 * reading — is exactly where the newest candles are.
	 */
	const plotWidth = plotWidthFor(width, height);
	const plotHeight = height - bottom;
	const seen = shownCandles.flatMap((candle) => [candle.high, candle.low]);
	const seenHigh = Math.max(...seen);
	const seenLow = Math.min(...seen);
	const mid = (seenHigh + seenLow) / 2;
	const half =
		((seenHigh - seenLow) / 2) * priceZoom || Math.abs(mid) * 0.01 || 1;
	const values = [mid - half, mid + half];
	// 🔴 Not zeroed: see the note on `scale`. A price axis fits the price, and
	// fits the VISIBLE price, so zooming in actually magnifies the movement.
	const at = scale(values, plotHeight, pad, false);
	const step = plotWidth / Math.max(shownCandles.length, 1);
	// A body narrower than its slot, always: touching bodies read as one block.
	const body = Math.max(1, Math.min(step - 1.5, 14));
	const latest = candles[candles.length - 1]?.close ?? 0;

	const track = (event: React.PointerEvent<SVGSVGElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - box.left;
		setHeld(
			x > plotWidth
				? null
				: Math.max(
						0,
						Math.min(shownCandles.length - 1, Math.floor(x / (step || 1))),
					),
		);
		// Pan while a pointer is down, in whole candles, so the chart never lands
		// between two of them.
		if (drag.current) {
			const moved = Math.round((event.clientX - drag.current.x) / (step || 1));
			setEnd(
				Math.max(
					0,
					Math.min(candles.length - visible, drag.current.end + moved),
				),
			);
		}
	};

	/**
	 * Zoom on the wheel, anchored to the newest candle.
	 *
	 * ⚠️ `passive: false` is impossible on a React `onWheel`, so this cannot call
	 * `preventDefault` and the page would scroll underneath. The listener is
	 * attached by hand for that one reason.
	 */
	const plot = useRef<SVGSVGElement | null>(null);
	useEffect(() => {
		const element = plot.current;
		if (!element) return;
		/**
		 * 🔑 WHICH axis zooms depends on where the pointer is, and that is the
		 * convention every terminal shares:
		 *
		 * - over the price gutter on the right → the PRICE axis stretches and the
		 *   time window is untouched;
		 * - anywhere else → the TIME axis, and the price re-fits itself.
		 *
		 * ⚠️ Zooming time keeps the NEWEST candle pinned to the right and pulls
		 * history in from the left. That is why `end` counts backwards from the
		 * newest: a chart that zoomed about its centre would walk the present off
		 * the screen, and the present is what somebody is looking at.
		 */
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const box = element.getBoundingClientRect();
			if (event.clientX - box.left > plotWidthFor(width, height)) {
				setPriceZoom((current) =>
					Math.max(
						0.15,
						Math.min(6, current * (event.deltaY > 0 ? 1.12 : 0.9)),
					),
				);
				return;
			}
			setZoom((current) => {
				const next = Math.round(current * (event.deltaY > 0 ? 1.15 : 0.87));
				// A floor of eight keeps a handful of candles readable; the ceiling
				// keeps a candle from falling under about three and a half pixels.
				return Math.max(
					8,
					Math.min(next, candles.length, Math.floor(width / 3.5)),
				);
			});
		};
		element.addEventListener("wheel", onWheel, { passive: false });
		return () => element.removeEventListener("wheel", onWheel);
		// ⚠️ `width` too: the ceiling is derived from it, so a resized card must
		// re-attach or zooming out stays capped at the old width.
	}, [candles.length, width, height]);

	const shown = held !== null ? shownCandles[held] : null;

	return (
		<div className="relative" style={{ width, height }}>
			{shown ? (
				<div
					/* Beside the candle, not over it. See the line chart's note. */
					style={{
						left:
							(held ?? 0) * step +
							step / 2 +
							((held ?? 0) * step > width - 130 ? -14 : 14),
						top: 2,
						transform:
							(held ?? 0) * step > width - 130
								? "translateX(-100%)"
								: undefined,
					}}
					className="pointer-events-none absolute z-10 rounded-lg bg-[var(--console-pop)] px-2 py-1 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
				>
					<span className="block text-[9.5px] text-[var(--ink-35)]">
						{shown.label}
					</span>
					<span className="block whitespace-nowrap text-[11px] text-[var(--ink-85)] tabular-nums">
						{format ? format(shown.close) : shown.close.toLocaleString()}
					</span>
					<span className="block whitespace-nowrap text-[9.5px] text-[var(--ink-35)] tabular-nums">
						{format ? format(shown.low) : shown.low} to{" "}
						{format ? format(shown.high) : shown.high}
					</span>
				</div>
			) : null}
			<svg
				ref={plot}
				width={width}
				height={height}
				className="block cursor-ew-resize touch-none"
				role="img"
				aria-label="Open, high, low and close. Drag to pan, scroll to zoom."
				onPointerMove={track}
				onPointerDown={(event) => {
					drag.current = { x: event.clientX, end: offset };
					event.currentTarget.setPointerCapture(event.pointerId);
					track(event);
				}}
				onPointerUp={(event) => {
					drag.current = null;
					event.currentTarget.releasePointerCapture(event.pointerId);
				}}
				onPointerLeave={() => {
					drag.current = null;
					setHeld(null);
				}}
				/* 🔑 Double click resets, the way double tapping a price scale does
				   on every terminal. Manual scaling with no way back is a trap: the
				   chart is wrong and nothing on screen says how to fix it. */
				onDoubleClick={() => {
					setPriceZoom(1);
					setZoom(60);
					setEnd(0);
				}}
			>
				{detailed ? (
					<PriceAxis
						plotWidth={plotWidth}
						width={width}
						height={plotHeight}
						values={values}
						at={at}
						latest={latest}
						format={format}
					/>
				) : null}
				{detailed ? (
					<TimeAxis
						candles={shownCandles}
						step={step}
						plotWidth={plotWidth}
						height={height}
					/>
				) : null}
				{/* 🔑 The DASHED crosshair a trading terminal uses, and the reason it is
				    dashed rather than solid: a candle chart is already dense with
				    vertical strokes, and one more solid line reads as another candle.
				    A dash cannot be mistaken for data. */}
				{shown ? (
					<>
						<line
							x1={(held ?? 0) * step + step / 2}
							x2={(held ?? 0) * step + step / 2}
							y1={0}
							y2={plotHeight}
							stroke="var(--chart-ink)"
							strokeOpacity="0.45"
							strokeWidth="1"
							strokeDasharray="3 3"
						/>
						{/* Stops at the gutter: the price column is not part of the plot. */}
						<line
							x1={0}
							x2={plotWidth}
							y1={at(shown.close)}
							y2={at(shown.close)}
							stroke="var(--chart-ink)"
							strokeOpacity="0.45"
							strokeWidth="1"
							strokeDasharray="3 3"
						/>
					</>
				) : null}
				{shownCandles.map((candle, index) => {
					const centre = index * step + step / 2;
					const rose = candle.close >= candle.open;
					/**
					 * ⚠️ The palette's own colours, never red and green.
					 *
					 * A trading terminal can assume its audience reads red as down. A
					 * business dashboard cannot: red already means FAILED everywhere
					 * else in this console, and a red candle would read as a broken day
					 * rather than a lower one. Up is the accent at full strength, down
					 * is the same colour held back — the same language the rest of the
					 * board speaks.
					 */
					const opacity = rose ? 0.9 : 0.42;
					const top = at(Math.max(candle.open, candle.close));
					const foot = at(Math.min(candle.open, candle.close));
					return (
						<g
							key={candle.label}
							opacity={held === null || held === index ? 1 : 0.45}
						>
							<line
								x1={centre}
								x2={centre}
								y1={at(candle.high)}
								y2={at(candle.low)}
								stroke="var(--chart-ink)"
								strokeOpacity={opacity}
								strokeWidth="1"
							/>
							<rect
								x={centre - body / 2}
								y={top}
								width={body}
								// A doji, where open and close match, still needs a mark: a
								// zero height rectangle draws nothing and the day vanishes.
								height={Math.max(1, foot - top)}
								rx={body > 4 ? 1 : 0}
								fill="var(--chart-ink)"
								fillOpacity={opacity}
							/>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/**
 * A series, drawn however the tile has been told to draw it.
 *
 * 🔑 The switch lives HERE rather than in each tile. Ten tiles each writing
 * their own `kind === "bars" ? … : …` is ten chances for one to forget a shape
 * the picker offers, and the picker would have no way to know.
 */
export function Series({
	kind,
	points,
	labels,
	format,
	candles,
}: SeriesProps & {
	/** Required for `candles`; ignored by every other shape. */
	candles?: Candle[];
}) {
	// `heat` is drawn by the tile itself; see the note on the union.
	if (kind === "none" || kind === "heat" || points.length === 0) return null;
	return (
		<Frame
			points={
				kind === "donut" ||
				kind === "pie" ||
				kind === "gauge" ||
				kind === "rows"
					? 1
					: points.length
			}
		>
			{({ width, height }) =>
				kind === "candles" && candles && candles.length > 0 ? (
					<Candles
						candles={candles}
						format={format}
						width={width}
						height={height}
					/>
				) : kind === "donut" || kind === "pie" ? (
					<Wheel
						points={points}
						labels={labels}
						hollow={kind === "donut"}
						width={width}
						height={height}
					/>
				) : kind === "rows" ? (
					<Rows
						kind={kind}
						points={points}
						labels={labels}
						format={format}
						width={width}
						height={height}
					/>
				) : kind === "dots" ? (
					<Dots
						kind={kind}
						points={points}
						labels={labels}
						format={format}
						width={width}
						height={height}
					/>
				) : kind === "gauge" ? (
					<Gauge
						kind={kind}
						points={points}
						labels={labels}
						format={format}
						width={width}
						height={height}
					/>
				) : kind === "bars" ? (
					<Columns
						kind={kind}
						points={points}
						labels={labels}
						format={format}
						width={width}
						height={height}
					/>
				) : (
					<Path
						kind={kind}
						points={points}
						labels={labels}
						format={format}
						width={width}
						height={height}
					/>
				)
			}
		</Frame>
	);
}
