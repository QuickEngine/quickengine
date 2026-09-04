import {
	AreaSeries,
	type CandlestickData,
	CandlestickSeries,
	CrosshairMode,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type LineData,
	LineType,
	type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

/**
 * A price chart, on TradingView's Lightweight Charts.
 *
 * ── Why a library, after building one by hand ────────────────────────────────
 *
 * 🔴 The hand written candle chart was replaced, and it is worth recording why
 * rather than quietly swapping it. Everything about a terminal chart that looks
 * like a small detail is a solved problem with a non obvious answer:
 *
 * - Zooming the time axis while the price axis re-fits, without the newest
 *   candle sliding off the right.
 * - A price scale you can drag independently, that snaps back to auto.
 * - Bar spacing that never lets candles overlap at any zoom, at any width.
 * - Crosshair, axis labels, and a price line that stay put while both axes move.
 *
 * Each of those took a round of "that looks broken", and they interact: fixing
 * the zoom ceiling moved the bodies, fixing the bodies broke the scale. This is
 * a solved problem and reimplementing it was costing more than it was worth.
 *
 * 🔑 Apache 2.0, free for commercial use, about 35KB, and made by TradingView.
 *
 * ⚠️ It is NOT the TradingView widget. The widget is an iframe carrying
 * somebody else's interface; this is a canvas library that draws what it is
 * told, so every colour below comes from our own theme tokens and the chart
 * belongs to this console.
 *
 * ⚠️ The licence requires attribution. `attributionLogo` puts a small
 * TradingView link in the corner and satisfies it; removing it would put the
 * project out of compliance, so it stays.
 */

/** Reads a CSS variable, since the library needs real colours not var(). */
function token(element: HTMLElement, name: string, fallback: string) {
	const value = getComputedStyle(element).getPropertyValue(name).trim();
	return value || fallback;
}

export type PriceBar = {
	/** Seconds since the epoch, which is what the library expects. */
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
};

export function PriceChart({
	bars,
	shape = "candles",
}: {
	bars: PriceBar[];
	/**
	 * ⚠️ Only two, and both are honest. A candle keeps all four numbers; an area
	 * keeps the close and says so by being a line. Anything else — bars, a pie of
	 * a price — would be throwing data away without admitting it.
	 */
	shape?: "candles" | "area";
}) {
	const box = useRef<HTMLDivElement | null>(null);
	const chart = useRef<IChartApi | null>(null);
	/**
	 * ⚠️ `unknown` rather than a union of two series types. The library's
	 * `addSeries` returns a wide union, and narrowing it here would mean naming
	 * all seven kinds to express "one of these two". The two `setData` branches
	 * below each assert the one they actually hold, which is where the knowledge
	 * genuinely is.
	 */
	const series = useRef<unknown>(null);

	useEffect(() => {
		const element = box.current;
		if (!element) return;

		const ink = token(element, "--chart-ink", "#7aa2f7");
		const line = token(element, "--console-line", "#2a2a2a");
		const text = token(element, "--ink-45", "#8a8a8a");
		const surface = token(element, "--surface-tile", "#131313");

		const made = createChart(element, {
			layout: {
				// Transparent, so the card's own surface shows through and the chart
				// changes colour with the palette rather than carrying its own.
				background: { color: "transparent" },
				textColor: text,
				attributionLogo: true,
			},
			/**
			 * 🔴 No grid at all. The candles ARE the structure here: a lattice
			 * behind several hundred vertical strokes is more lines than data, and
			 * on a dark surface the grid competes with the wicks it sits behind.
			 * The two axis borders and the crosshair carry every reference somebody
			 * needs, and each of those only appears where it is being used.
			 */
			grid: {
				vertLines: { visible: false },
				horzLines: { visible: false },
			},
			/**
			 * 🔑 `Normal` gives the asymmetry a terminal has: the VERTICAL line
			 * snaps to a bar, because a chart of buckets means nothing between two
			 * of them, while the HORIZONTAL moves freely, because every price
			 * between two candles is a real price worth reading off the axis.
			 *
			 * ⚠️ NOT `Magnet`. That pulls the horizontal onto the nearest candle's
			 * price too, which sounds helpful and means you can never point at a
			 * level the market has not traded — which is most of what a crosshair
			 * is for. It is also the default, and stated here so nobody "fixes" it
			 * to Magnet later.
			 */
			crosshair: {
				mode: CrosshairMode.Normal,
				vertLine: { color: ink, width: 1, style: 3, labelBackgroundColor: ink },
				horzLine: { color: ink, width: 1, style: 3, labelBackgroundColor: ink },
			},
			rightPriceScale: { borderColor: line },
			/**
			 * 🔴 The chart stops at its own data, in both directions.
			 *
			 * Without these you can scroll past the newest candle into empty future
			 * and past the oldest into empty past — a screen of nothing with the
			 * axis still ticking, which reads as the chart having LOST its data
			 * rather than having run out of it. There is no history before the first
			 * tick and no price after the last, so neither is somewhere the eye
			 * should be able to go.
			 */
			timeScale: {
				borderColor: line,
				timeVisible: true,
				secondsVisible: false,
				fixLeftEdge: true,
				fixRightEdge: true,
			},
			autoSize: true,
		});

		/**
		 * 🔴 The palette's own colour for up and down, never red and green.
		 *
		 * A terminal can assume its reader takes red as "down". This console
		 * cannot: red already means FAILED on every other surface, so a red candle
		 * would read as a broken day rather than a lower one. Up is the accent at
		 * full strength, down is the same colour held back — the language the rest
		 * of the board speaks.
		 */
		const drawn =
			shape === "area"
				? made.addSeries(AreaSeries, {
						lineColor: ink,
						topColor: `${ink}44`,
						bottomColor: `${ink}00`,
						lineWidth: 2,
						/**
						 * 🔑 Curved, to match the dashboard's own line and area charts.
						 * Those interpolate through their readings rather than joining
						 * them with straight segments, and a market line drawn as a saw
						 * beside them would read as a different product.
						 *
						 * ⚠️ The library's `Curved` is a spline through the points, so
						 * like ours it never invents a value outside two readings — the
						 * curve stays between them. A smoothing that overshoots would
						 * draw a price the market never traded at, which on a chart of
						 * money is not a cosmetic difference.
						 */
						lineType: LineType.Curved,
					})
				: made.addSeries(CandlestickSeries, {
						upColor: ink,
						downColor: surface,
						borderUpColor: ink,
						borderDownColor: ink,
						wickUpColor: ink,
						wickDownColor: ink,
					});

		chart.current = made;
		series.current = drawn;
		return () => {
			made.remove();
			chart.current = null;
			series.current = null;
		};
		// ⚠️ Rebuilt when the shape changes: a series cannot become another kind,
		// so the chart is torn down and remade rather than mutated.
	}, [shape]);

	useEffect(() => {
		if (!series.current || bars.length === 0) return;
		if (shape === "area") {
			(series.current as ISeriesApi<"Area">).setData(
				bars.map(
					(bar): LineData => ({
						time: bar.time as UTCTimestamp,
						value: bar.close,
					}),
				),
			);
		} else {
			(series.current as ISeriesApi<"Candlestick">).setData(
				bars.map(
					(bar): CandlestickData => ({
						time: bar.time as UTCTimestamp,
						open: bar.open,
						high: bar.high,
						low: bar.low,
						close: bar.close,
					}),
				),
			);
		}
		// ⚠️ Only on the FIRST load. Re-fitting on every refresh would throw away
		// wherever somebody had scrolled to, once a minute, forever.
		chart.current?.timeScale().fitContent();
	}, [bars, shape]);

	return <div ref={box} className="h-full min-h-0 w-full min-w-0" />;
}
