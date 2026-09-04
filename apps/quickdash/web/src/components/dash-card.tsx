import type { ReactNode } from "react";

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
			className={`flex h-full min-w-0 flex-col rounded-xl border border-[var(--console-line)] bg-[var(--surface-tile)] p-4 ${className}`}
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
export function Area({
	points,
	height = 64,
	tone = "var(--ink-90)",
}: {
	points: number[];
	height?: number;
	tone?: string;
}) {
	const top = Math.max(...points, 1);
	const step = points.length > 1 ? 100 / (points.length - 1) : 100;
	// 2 units of headroom so a peak at the maximum is not clipped by the stroke.
	const y = (value: number) => 38 - (value / top) * 36;
	const line = points.map((v, i) => `${i * step},${y(v)}`).join(" ");

	return (
		<svg
			viewBox="0 0 100 40"
			preserveAspectRatio="none"
			style={{ height }}
			className="w-full"
			role="img"
			aria-label="Trend"
		>
			<title>Trend</title>
			<defs>
				<linearGradient id="dash-area" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={tone} stopOpacity="0.18" />
					<stop offset="100%" stopColor={tone} stopOpacity="0" />
				</linearGradient>
			</defs>
			<polygon points={`0,40 ${line} 100,40`} fill="url(#dash-area)" />
			<polyline
				points={line}
				fill="none"
				stroke={tone}
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

/**
 * A bar series, for counts rather than a trend.
 *
 * 🔑 Bars where the reading is "how many, each day" and an area where it is "how
 * it moved". Using one for both makes a series of discrete daily totals look
 * like a continuous measurement, which is a claim the data does not make.
 */
export function Bars({
	points,
	labels,
	height = 64,
}: {
	points: number[];
	labels?: string[];
	height?: number;
}) {
	const top = Math.max(...points, 1);
	return (
		<div className="flex items-end gap-1" style={{ height }}>
			{points.map((value, index) => (
				<div
					key={labels?.[index] ?? index}
					title={labels?.[index]}
					className="min-w-0 flex-1 rounded-sm bg-[rgb(var(--console-ink)/0.14)]"
					style={{
						// ⚠️ A floor of 2%, so a zero day is still a visible tick rather
						// than a gap. A missing bar reads as missing DATA; a flat one
						// reads as a quiet day, which is what it is.
						height: `${Math.max(2, (value / top) * 100)}%`,
					}}
				/>
			))}
		</div>
	);
}
