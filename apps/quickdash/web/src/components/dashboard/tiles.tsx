import { ArrowRightIcon } from "@phosphor-icons/react";
import { presentRequestError } from "@quickengine/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { workspaceApi } from "../../lib/api";
import {
	barsFor,
	fetchBars,
	fetchQuote,
	intervalFor,
	readWatchlist,
	type Watched,
	writeWatchlist,
} from "../../lib/markets";
import { type HomeEntry, quickDashQueries } from "../../lib/quickdash-api";
import { type ChartKind, Series } from "../charts";
import { Card, Heatmap, Stat } from "../dash-card";
import { RequestIdInline } from "../outlet-error";
import { RequestFailure } from "../page-state";
import { PriceChart } from "../price-chart";
import { SkeletonRows } from "../skeletons";

/**
 * The tiles a dashboard can be built from.
 *
 * 🔴 EACH TILE FETCHES ITS OWN DATA, and that is the whole point.
 *
 * Home used to fetch revenue, traffic, activity and the day's work in one
 * component and hand them down. That is fine for a fixed page and wrong for a
 * board somebody composes: a tile nobody has placed would still be fetched by
 * everybody, so "modular" would describe the layout and nothing else. A tile
 * that is not on your board now costs you nothing.
 *
 * 🔑 Every tile names the MODULE it needs. `context.modules` already returns
 * only what a workspace has switched on, so the picker filters with one line —
 * turn a module on and its tiles become available, turn it off and they leave
 * the board and the picker together.
 *
 * ⚠️ Sizes are DECLARED, not free. A stat is one cell, a chart wants two by
 * two. Free resize lets somebody make a chart 1x1, which looks broken and is
 * then their fault.
 */

export type TileSpan = "1x1" | "2x1" | "2x2" | "4x1" | "4x2";

export type TileSpec = {
	id: string;
	/** The module this tile is meaningless without. Omit for always-available. */
	module?: string;
	name: string;
	/** What it tells you, shown in the picker. */
	blurb: string;
	/** How big it arrives. Any size is allowed afterwards. */
	defaultCols: number;
	defaultRows: number;
	/**
	 * ⚠️ A COMPONENT, and it must be rendered as one — `<tile.Render …/>`, never
	 * `tile.Render({…})`. Every tile owns hooks; calling it would splice those
	 * into whatever renders the board, and then adding or moving a tile changes
	 * that component's hook count.
	 */
	/**
	 * The shapes this tile's data can honestly take.
	 *
	 * 🔑 Declared by the TILE, not offered by the picker. Seven days of revenue
	 * as a donut says "Tuesday was 18% of the week", which is arithmetic nobody
	 * wants; a category split as a line draws a trend across things that have no
	 * order. Only the tile knows which of its shapes are true, so only the tile
	 * decides what it may be asked to become.
	 *
	 * Omit for a tile that draws no series at all: the picker then leaves it
	 * alone rather than offering a choice that does nothing.
	 */
	charts?: readonly ChartKind[];
	Render: (props: {
		workspaceId: string;
		workspace: string;
		/** What the board wants drawn. Absent until somebody chooses. */
		chart?: ChartKind;
		/**
		 * How far back to look, from the board's own range control.
		 *
		 * ⚠️ Passed to EVERY tile and ignored by the ones with no range: a count
		 * of customers on your books is not "in the last 30 days", it is now. A
		 * tile that quietly reinterpreted the range as a filter would answer a
		 * different question from the one the control appears to ask.
		 */
		days?: number;
	}) => ReactNode;
};

const SPAN_CLASS: Readonly<Record<TileSpan, string>> = {
	"1x1": "",
	"2x1": "sm:col-span-2 lg:col-span-2",
	"2x2": "sm:col-span-2 lg:col-span-2 lg:row-span-2",
	"4x1": "sm:col-span-2 lg:col-span-4",
	"4x2": "sm:col-span-2 lg:col-span-4 lg:row-span-2",
};

export function spanClass(span: TileSpan): string {
	return SPAN_CLASS[span] ?? "";
}

/** How many columns and rows a span occupies. */
export function spanSize(span: TileSpan): { cols: number; rows: number } {
	const [cols, rows] = span.split("x").map(Number);
	return { cols: cols || 1, rows: rows || 1 };
}

export const BOARD_COLUMNS = 4;

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat("en", { style: "currency", currency }).format(
		cents / 100,
	);

/* ── The tiles ───────────────────────────────────────────────────────── */

/**
 * Seven days of settled money, normalised.
 *
 * 🔴 Through the SDK's typed methods, not a hand-written path. `reports.revenue`
 * is what exists — there is no `/reporting/revenue` route, and inventing one is
 * how a tile ends up saying "this resource wasn't found" on a workspace that is
 * perfectly healthy.
 *
 * ⚠️ The series only carries days that SAW money, so it is normalised to seven
 * here. A chart drawn from four points and labelled a week is a lie about the
 * three days that took nothing.
 */
function useWeek(workspaceId: string, days = 7) {
	const revenue = useQuery({
		queryKey: ["quickdash", workspaceId, "week", days],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - (days - 1) * 86_400_000);
			from.setHours(0, 0, 0, 0);
			return (
				await workspaceApi(workspaceId).reports.revenue({
					from,
					to,
					granularity: "day",
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
				})
			).data;
		},
	});

	const collected = (revenue.data?.collected ?? []) as Array<{
		bucket: string;
		currency: string;
		amountCents: string | number | undefined;
		count: number | undefined;
	}>;
	const byDay = new Map<string, { cents: number; count: number }>();
	for (const row of collected) {
		const day = row.bucket.slice(0, 10);
		const at = byDay.get(day) ?? { cents: 0, count: 0 };
		byDay.set(day, {
			cents: at.cents + Number(row.amountCents ?? 0),
			// 🔴 The series has carried a per bucket COUNT all along and nothing
			// read it. "Orders this week" was plotting revenue in cents under an
			// orders heading, so its bars answered a question nobody asked.
			count: at.count + Number(row.count ?? 0),
		});
	}
	const week = Array.from({ length: days }, (_, index) => {
		const date = new Date(Date.now() - (days - 1 - index) * 86_400_000);
		const day = date.toISOString().slice(0, 10);
		const at = byDay.get(day);
		return { day, cents: at?.cents ?? 0, count: at?.count ?? 0 };
	});

	/**
	 * 🔴 No candles here, and the attempt is worth recording.
	 *
	 * A candle needs four numbers per bucket — open, high, low, close — and
	 * revenue per day is ONE. Deriving them from a running total produced a
	 * chart that was technically correct and visually meaningless: every candle
	 * was a plain bar from yesterday's total to today's, with no wick, because
	 * there was no high or low to draw. It looked like a broken bar chart
	 * because that is what it was.
	 *
	 * ⚠️ The `Candles` renderer stays in `charts.tsx`. It is right for data that
	 * genuinely has a range within each bucket — a token price between a sale and
	 * its settlement is the case this product will actually meet — and the shape
	 * should exist before that module needs it. It is simply not offered on a
	 * tile whose data cannot fill it.
	 */

	return {
		query: revenue,
		week,
		currency: collected[0]?.currency ?? "USD",
	};
}

function RevenueTile({
	workspaceId,
	chart = "area",
	days = 7,
}: {
	workspaceId: string;
	chart?: ChartKind;
	days?: number;
}) {
	const { query, week, currency } = useWeek(workspaceId, days);
	const total = week.reduce((sum, entry) => sum + entry.cents, 0);
	const today = week[week.length - 1]?.cents ?? 0;

	return (
		<Card title={`Revenue, last ${days} days`}>
			{query.isPending ? (
				<SkeletonRows rows={3} />
			) : query.isError ? (
				<RequestFailure error={query.error} onRetry={() => query.refetch()} />
			) : (
				<>
					<Stat
						value={money(today, currency)}
						sub={`${money(total, currency)} over ${days} days`}
					/>
					{/* `flex-1` and `min-h-0`: the chart takes whatever the card has
					    left after the number, so resizing the tile resizes the chart. */}
					<div className="mt-4 min-h-0 flex-1">
						<Series
							kind={chart}
							points={week.map((entry) => entry.cents)}
							labels={week.map((entry) => entry.day.slice(5))}
							/* The axis reads in whole units: cents on a gridline is six
							   digits of false precision on a chart nobody measures with. */
							format={(value) => money(Math.round(value), currency)}
						/>
					</div>
				</>
			)}
		</Card>
	);
}

function OrdersTile({
	workspaceId,
	chart = "bars",
	days = 7,
}: {
	workspaceId: string;
	chart?: ChartKind;
	days?: number;
}) {
	const { week } = useWeek(workspaceId, days);
	return (
		<Card title={`Orders, last ${days} days`}>
			<Stat
				value={String(week.reduce((sum, entry) => sum + entry.count, 0))}
				sub={`paid in the last ${days} days`}
			/>
			<div className="mt-4 min-h-0 flex-1">
				<Series
					kind={chart}
					points={week.map((entry) => entry.count)}
					labels={week.map((entry) => entry.day.slice(5))}
					format={(value) => String(Math.round(value))}
				/>
			</div>
		</Card>
	);
}

function TrafficTile({
	workspaceId,
	chart,
	days: span = 90,
}: {
	workspaceId: string;
	chart?: ChartKind;
	days?: number;
}) {
	/**
	 * 🔴 A heatmap is a YEAR, and it ignores the board's range on purpose.
	 *
	 * Every other chart answers "what happened over the last N days" and the
	 * range control changes N. A contribution graph answers a different question
	 * — which days of which weeks this business is busy — and that pattern only
	 * exists across a season. Handed seven days it drew seven squares in a wide
	 * empty card, which is not a small heatmap, it is the wrong chart.
	 *
	 * ⚠️ The range still governs the NUMBER above it and every other shape. The
	 * heatmap alone fetches its own year underneath.
	 */
	const heat = chart === "heat" || (!chart && span > 30);
	// ⚠️ Not `window`: that shadows the global, and a chart is the last place
	// anybody should be shadowing it.
	const lookback = heat ? 365 : span;
	/**
	 * 🔴 The SERIES, not the summary.
	 *
	 * This tile showed three totals and nothing else, while `reports.traffic()`
	 * has always returned a bucketed series it simply never asked for. Three
	 * numbers cannot say whether a fortnight went quiet or which day carries the
	 * week, which is the only thing anybody actually wants from traffic.
	 *
	 * ⚠️ Ninety days, because a heatmap needs a season to have a pattern. A week
	 * of cells is seven squares and says less than the number above it.
	 */
	const traffic = useQuery({
		queryKey: ["quickdash", workspaceId, "traffic-series", lookback],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - (lookback - 1) * 86_400_000);
			from.setHours(0, 0, 0, 0);
			const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
			const [series, summary] = await Promise.all([
				workspaceApi(workspaceId).reports.traffic({
					from,
					to,
					timeZone: zone,
					granularity: "day",
				}),
				workspaceApi(workspaceId).reports.trafficSummary({
					from,
					to,
					timeZone: zone,
				}),
			]);
			return { series: series.data, summary: summary.data };
		},
	});

	const views = Number(traffic.data?.summary?.views ?? 0);
	const days = (traffic.data?.series ?? []).map((point) => ({
		date: String(point.bucket),
		// ⚠️ `views`, the name the traffic series actually publishes. `count` is
		// what the generic series type offers and what revenue uses; traffic
		// counts page views and says so.
		value: Number(point.views ?? point.count ?? 0),
	}));

	return (
		<Card
			title={
				heat ? "Site traffic, last year" : `Site traffic, last ${span} days`
			}
		>
			{/* 🔑 Traffic is self-reported by the customer's own site, so a workspace
			    with no site reporting has NONE. That is absence, not zero. */}
			{views === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					Nothing reported yet. Your site sends this once QuickConnect is
					installed.
				</p>
			) : (
				/* 🔴 `flex-1` and `min-h-0`. The heatmap fills the height it is given,
				   and this wrapper gave it none: it measured zero and drew nothing,
				   so the tile looked broken while the data was fine. A measured chart
				   needs a parent that actually has a size. */
				<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
					<Stat
						value={Number(
							traffic.data?.summary?.visitors ?? 0,
						).toLocaleString()}
						sub={`${Number(traffic.data?.summary?.sessions ?? 0).toLocaleString()} sessions · ${views.toLocaleString()} views`}
					/>
					<div className="min-h-0 flex-1">
						{/* 🔴 A heatmap is a SEASON chart, so it is not the right shape
						    for every range. Seven days is seven squares and says nothing a
						    line does not say better; ninety days is a pattern only a
						    heatmap shows. The tile picks the honest default for the range
						    it was given, and the picker can still override it. */}
						{heat ? (
							<Heatmap days={days} />
						) : (
							<Series
								// Already narrowed: this branch cannot be "heat".
								kind={chart ?? "area"}
								points={days.map((day) => day.value)}
								labels={days.map((day) => day.date.slice(5))}
								format={(value) => String(Math.round(value))}
							/>
						)}
					</div>
				</div>
			)}
		</Card>
	);
}

/**
 * A watchlist, and a candle chart for whichever symbol is selected.
 *
 * 🔴 It WATCHES, it does not hold. There is no wallet, no balance and no
 * connection to anything of yours — which is deliberately where this starts.
 * A watchlist needs no key, no permission and no custody question, so it proves
 * the whole path (feed, candles, theme, refresh) before anybody is asked to
 * connect an address. Holdings are the next slice, not this one.
 *
 * ⚠️ It is not advice and it is not a portfolio. Anything that moves money
 * belongs nowhere near a dashboard tile.
 */
function MarketsTile({ days = 30 }: { days?: number }) {
	/**
	 * Candles or a line, and nothing else.
	 *
	 * ⚠️ Not the board's chart picker. That picker offers shapes for a series of
	 * plain numbers; a price bucket carries four, and every other shape would
	 * silently drop three of them. Two honest choices, on the tile.
	 */
	const [shape, setShape] = useState<"candles" | "area">("candles");
	const [list, setList] = useState<Watched[]>(readWatchlist);
	const [active, setActive] = useState(0);
	const [adding, setAdding] = useState("");
	const watched = list[Math.min(active, list.length - 1)];

	const quote = useQuery({
		queryKey: ["markets", "quote", watched?.symbol],
		queryFn: () => fetchQuote(watched.symbol),
		enabled: Boolean(watched),
		// A price is stale the moment it arrives; a dashboard is not a terminal,
		// so it refreshes on a human rhythm rather than a trading one.
		refetchInterval: 60_000,
	});

	const bars = useQuery({
		queryKey: ["markets", "bars", watched?.symbol, days],
		queryFn: () => fetchBars(watched.symbol, intervalFor(days), barsFor(days)),
		enabled: Boolean(watched),
		refetchInterval: 300_000,
	});

	const add = () => {
		const symbol = adding.trim().toUpperCase();
		if (!symbol) return;
		// Somebody types BTC, Binance wants BTCUSDT. Accepting both is the
		// difference between a control that works and one that needs a manual.
		const full = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
		if (list.some((entry) => entry.symbol === full)) return setAdding("");
		const next = [...list, { symbol: full, name: symbol.replace("USDT", "") }];
		setList(next);
		writeWatchlist(next);
		setAdding("");
		setActive(next.length - 1);
	};

	const price = quote.data?.price ?? 0;
	const change = quote.data?.changePercent ?? 0;

	return (
		<Card title="Markets">
			<div className="flex min-h-0 flex-1 flex-col gap-2">
				{/* The list itself: small, because the chart is the subject. */}
				<div className="flex flex-wrap items-center gap-1">
					{list.map((entry, index) => (
						<button
							key={entry.symbol}
							type="button"
							aria-pressed={index === active}
							onClick={() => setActive(index)}
							className={`h-6 rounded-md px-2 text-[11px] transition-colors ${
								index === active
									? "control-raised border-0 text-[var(--ink-90)]"
									: "text-[var(--ink-40)] hover:text-[var(--ink-80)]"
							}`}
						>
							{entry.name}
						</button>
					))}
					{/* 🔴 A field AND a button. It was a bare input that only responded
					    to Enter, so a control labelled "Add" did nothing when pressed —
					    which is indistinguishable from broken. A keyboard path is not a
					    substitute for the obvious one. */}
					<input
						value={adding}
						onChange={(event) => setAdding(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") add();
						}}
						placeholder="BTC"
						aria-label="Add a symbol"
						className="field h-6 w-16 rounded-md px-1.5 text-[11px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-25)]"
					/>
					<button
						type="button"
						onClick={add}
						disabled={!adding.trim()}
						className="control-raised flex h-6 items-center rounded-md border px-2 text-[11px] text-[var(--ink-55)] outline-none hover:text-[var(--ink-90)] disabled:opacity-40"
					>
						Add
					</button>
					{/* The console's switch, at the scale of the row it sits in. */}
					<div
						className="ml-auto flex items-center gap-0.5 rounded-[5px] bg-[var(--view-face)] p-0.5"
						style={{ boxShadow: "var(--lift-inset)" }}
					>
						{(["candles", "area"] as const).map((entry) => (
							<button
								key={entry}
								type="button"
								aria-pressed={shape === entry}
								onClick={() => setShape(entry)}
								className={
									shape === entry
										? "control-raised h-5 rounded-[3px] border-0 px-2 text-[10.5px] text-[var(--ink-90)]"
										: "h-5 rounded-[3px] px-2 text-[10.5px] text-[var(--ink-35)] transition-colors hover:text-[var(--ink-70)]"
								}
							>
								{entry === "candles" ? "Candles" : "Line"}
							</button>
						))}
					</div>
					{list.length > 1 ? (
						<button
							type="button"
							onClick={() => {
								const next = list.filter((_, index) => index !== active);
								setList(next);
								writeWatchlist(next);
								setActive(0);
							}}
							data-hint={`Stop watching ${watched?.name}`}
							className="h-6 rounded-md px-2 text-[11px] text-[var(--ink-30)] transition-colors hover:text-[var(--signal-failure-text)]"
						>
							Remove
						</button>
					) : null}
				</div>

				{quote.isError ? (
					<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
						That price could not be read. The market feed may be unreachable
						from here.
					</p>
				) : (
					<>
						<Stat
							value={
								quote.isPending
									? "…"
									: price.toLocaleString(undefined, {
											style: "currency",
											currency: "USD",
											maximumFractionDigits: price < 10 ? 4 : 2,
										})
							}
							/* ⚠️ An arrow and a sign, not a colour. Red already means FAILED
							   everywhere else in this console, and a red price would read as
							   a broken tile rather than a lower one. */
							sub={`${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}% today`}
						/>
						<div className="min-h-0 flex-1">
							{bars.data && bars.data.length > 0 ? (
								<PriceChart bars={bars.data} shape={shape} />
							) : null}
						</div>
					</>
				)}
			</div>
		</Card>
	);
}

/** Which module page an entry on Home belongs to. See `EntryRow`. */
const HOME_MODULE: Record<string, string> = {
	orders: "orders",
	invoices: "invoicing",
	bookings: "bookings",
	tasks: "projects-tasks",
	payments: "payments",
	shipments: "shipping",
};

function EntryRow({
	entry,
	workspaceId,
}: {
	entry: HomeEntry;
	workspaceId: string;
}) {
	return (
		<Link
			to="/$workspace/$module"
			/**
			 * 🔴 Split on the DOT, and translate to the module's real id.
			 *
			 * It split on a colon, and none of these ids contain one — so
			 * `orders.unfulfilled` was handed to the route whole and every row on
			 * both panels linked to a module that does not exist. It has been a
			 * 404 on click since these tiles were written.
			 *
			 * ⚠️ The prefix is not always the module: the invoicing module is
			 * `invoicing` and its entries say `invoices`, tasks live in
			 * `projects-tasks`. A map, because guessing is what produced the bug.
			 */
			params={{
				workspace: workspaceId,
				module: HOME_MODULE[entry.id.split(".")[0]] ?? entry.id.split(".")[0],
			}}
			className="flex items-center justify-between gap-3 py-2 no-underline"
		>
			<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-80)]">
				{entry.samples[0]?.label ?? entry.id}
			</span>
			<span className="shrink-0 text-[11px] text-[var(--ink-35)] tabular-nums">
				{entry.count}
			</span>
			<ArrowRightIcon size={12} className="shrink-0 text-[var(--ink-25)]" />
		</Link>
	);
}

function NeedsYouTile({
	workspaceId,
	workspace,
}: {
	workspaceId: string;
	workspace: string;
}) {
	const home = useQuery(quickDashQueries.home(workspaceId));
	const rows = home.data?.needsYou ?? [];
	return (
		<Card title="Needs you">
			{home.isPending ? (
				<SkeletonRows rows={3} />
			) : home.isError ? (
				<TileFailure error={home.error} onRetry={() => void home.refetch()} />
			) : rows.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					Nothing waiting. No orders to fulfil, no messages to answer.
				</p>
			) : (
				/* 🔑 Scrolls. These three tiles hold a LIST, and a list is however long it
				    is: a card two rows tall showed the first three of eleven things
				    waiting on somebody and gave no sign the other eight existed. The
				    card is now a window onto the list rather than a truncation of it,
				    with `fade-ends` so the cut is obviously a cut. */
				<div className="fade-ends flex min-h-0 flex-1 flex-col overflow-y-auto">
					{rows.map((entry) => (
						<EntryRow key={entry.id} entry={entry} workspaceId={workspace} />
					))}
				</div>
			)}
		</Card>
	);
}

function TodayTile({
	workspaceId,
	workspace,
}: {
	workspaceId: string;
	workspace: string;
}) {
	const home = useQuery(quickDashQueries.home(workspaceId));
	const rows = home.data?.today ?? [];
	return (
		<Card title="Happening today">
			{home.isPending ? (
				<SkeletonRows rows={3} />
			) : home.isError ? (
				/* "A quiet day so far" is the most expensive sentence on this board
				   to get wrong, and it was what a failed request produced. */
				<TileFailure error={home.error} onRetry={() => void home.refetch()} />
			) : rows.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					A quiet day so far.
				</p>
			) : (
				/* 🔑 Scrolls. These three tiles hold a LIST, and a list is however long it
				    is: a card two rows tall showed the first three of eleven things
				    waiting on somebody and gave no sign the other eight existed. The
				    card is now a window onto the list rather than a truncation of it,
				    with `fade-ends` so the cut is obviously a cut. */
				<div className="fade-ends flex min-h-0 flex-1 flex-col overflow-y-auto">
					{rows.map((entry) => (
						<EntryRow key={entry.id} entry={entry} workspaceId={workspace} />
					))}
				</div>
			)}
		</Card>
	);
}

/**
 * `invoice.created` as a person would say it.
 *
 * 🔴 The raw event name is CORRECT and belongs in the developer console, where
 * somebody is matching it against a webhook payload. It does not belong on the
 * first card a new customer sees: "invoice.created" reads as a log line that
 * leaked onto the dashboard, and the reader has to know it is a namespaced
 * event rather than a mistake.
 *
 * 🔑 Derived, not enumerated — the same reasoning as the Activity page's own
 * `describe()`. There are ninety-odd event names and the shape is regular, so a
 * map would be ninety chances to get one wrong and would silently miss the next
 * one added.
 */
function readable(name: string) {
	const [thing, verb] = [
		name.slice(0, name.lastIndexOf(".")),
		name.slice(name.lastIndexOf(".") + 1),
	];
	if (!verb) return name;
	const noun = thing.replace(/[-.]/g, " ");
	const said = verb.replace(/-/g, " ");
	return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${said}`;
}

function ActivityTile({ workspaceId }: { workspaceId: string }) {
	const activity = useQuery({
		queryKey: ["quickdash", workspaceId, "activity"],
		queryFn: async () =>
			(await workspaceApi(workspaceId).activity.list({ limit: 8 })).data,
	});
	/* ⚠️ `name`, not `action` — an event is `invoice.paid`, the same string a
	   webhook delivery carries. */
	const events = activity.data?.events ?? [];
	return (
		<Card title="Recent activity">
			{activity.isPending ? (
				<SkeletonRows rows={4} />
			) : activity.isError ? (
				<TileFailure
					error={activity.error}
					onRetry={() => void activity.refetch()}
				/>
			) : events.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)]">
					Nothing has happened here yet.
				</p>
			) : (
				/* 🔑 Scrolls. These three tiles hold a LIST, and a list is however long it
				    is: a card two rows tall showed the first three of eleven things
				    waiting on somebody and gave no sign the other eight existed. The
				    card is now a window onto the list rather than a truncation of it,
				    with `fade-ends` so the cut is obviously a cut. */
				<div className="fade-ends flex min-h-0 flex-1 flex-col overflow-y-auto">
					{events.map((row) => (
						<div
							key={row.id}
							className="flex items-center justify-between gap-3 py-2"
						>
							<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-75)]">
								{readable(row.name)}
							</span>
							<span className="shrink-0 text-[11px] text-[var(--ink-25)]">
								{new Date(row.occurredAt).toLocaleDateString()}
							</span>
						</div>
					))}
				</div>
			)}
		</Card>
	);
}

/** A single number from a list, for the small tiles. */
function CountTile({
	workspaceId,
	title,
	path,
	sub,
}: {
	workspaceId: string;
	title: string;
	path: string;
	sub: string;
}) {
	const rows = useQuery({
		queryKey: ["quickdash", workspaceId, "count", path],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: unknown[] }>(
					`${path}?limit=100`,
				)
			).data,
	});
	return (
		<Card title={title}>
			{rows.isPending ? (
				<SkeletonRows rows={1} />
			) : rows.isError ? (
				<TileFailure error={rows.error} onRetry={() => void rows.refetch()} />
			) : (
				<Stat value={String(rows.data?.items?.length ?? 0)} sub={sub} />
			)}
		</Card>
	);
}

/**
 * A tile whose own request did not come back.
 *
 * 🔴 Four of the five tiles reported GOOD NEWS when they failed. "Needs you"
 * said "Nothing waiting. No orders to fulfil, no messages to answer", activity
 * said "Nothing has happened here yet", and the counters showed 0 — all of them
 * reading `data ?? []` after a failure they never checked for. So a broken
 * dashboard looked exactly like a quiet morning, which is the one lie a
 * business cannot afford on the screen it opens first.
 *
 * ⚠️ Compact on purpose. A tile is one of eight on a board, and a full error
 * card in each would make one dead request look like a dead console. It says
 * what happened, offers the retry, and lets the rest of the board be read.
 */
function TileFailure({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const it = presentRequestError(error);
	return (
		<div role="alert" className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className="size-1.5 shrink-0 rounded-full bg-[var(--signal-attention)]"
				/>
				{/* 🔴 A tile is not a page, and it must not borrow the page's words.
				    `inlineFailure` returns "QuickDash couldn't load this page. Try
				    again; if it keeps happening, quote the request ID below" —
				    written for a screen that has taken over, and wrong in every
				    clause here: it is not the page, there was no ID below because
				    this never rendered one, and "below" pointed at nothing. */}
				<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-50)]">
					{it.kind === "network" ? "No connection." : "This didn’t load."}
				</span>
				<button
					type="button"
					onClick={onRetry}
					className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--ink-45)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-85)]"
				>
					Retry
				</button>
			</div>
			{/* Now it is actually there, and copyable, like everywhere else. */}
			{it.requestId ? (
				<div className="-ml-1.5">
					<RequestIdInline id={it.requestId} />
				</div>
			) : null}
		</div>
	);
}

export const TILES: readonly TileSpec[] = [
	{
		id: "revenue",
		module: "reporting-analytics",
		name: "Revenue",
		blurb: "What came in over the last seven days, with a chart.",
		defaultCols: 2,
		defaultRows: 2,
		charts: ["area", "line", "step", "bars", "donut", "pie", "none"],
		Render: ({ workspaceId, chart, days }) => (
			<RevenueTile workspaceId={workspaceId} chart={chart} days={days} />
		),
	},
	{
		id: "orders-week",
		module: "orders",
		name: "Orders this week",
		blurb: "How many days took a sale, day by day.",
		defaultCols: 2,
		defaultRows: 2,
		charts: ["bars", "area", "line", "step", "rows", "donut", "pie", "none"],
		Render: ({ workspaceId, chart, days }) => (
			<OrdersTile workspaceId={workspaceId} chart={chart} days={days} />
		),
	},
	{
		id: "traffic",
		module: "reporting-analytics",
		name: "Site traffic",
		blurb: "Visitors, sessions and views from your own site.",
		defaultCols: 1,
		defaultRows: 1,
		charts: ["heat", "area", "line", "step", "bars", "none"],
		Render: ({ workspaceId, chart, days }) => (
			<TrafficTile workspaceId={workspaceId} chart={chart} days={days} />
		),
	},
	{
		/**
		 * ⚠️ No `module`. Watching a price is not a QuickDash capability somebody
		 * buys, it is a widget over public data, so it is available to every
		 * workspace the way "Needs you" is.
		 */
		id: "markets",
		name: "Markets",
		blurb: "Watch a coin's price, with candles.",
		defaultCols: 2,
		defaultRows: 2,
		/**
		 * ⚠️ Candles ONLY, and no picker.
		 *
		 * Every other shape here would throw away three of the four numbers a
		 * price bucket carries — the range and the direction within it are the
		 * entire reason to look at a market rather than a total. Offering "Line"
		 * would be offering a worse chart of the same data, and a picker whose
		 * every alternative is worse is a menu of ways to be wrong.
		 */
		charts: ["candles"],
		Render: ({ days }) => <MarketsTile days={days} />,
	},
	{
		id: "needs-you",
		name: "Needs you",
		blurb: "Everything waiting on a person, across every module.",
		defaultCols: 1,
		defaultRows: 1,
		Render: (props) => <NeedsYouTile {...props} />,
	},
	{
		id: "today",
		name: "Happening today",
		blurb: "What is due or booked for today.",
		defaultCols: 1,
		defaultRows: 1,
		Render: (props) => <TodayTile {...props} />,
	},
	{
		id: "activity",
		name: "Recent activity",
		blurb: "Who changed what, most recent first.",
		defaultCols: 4,
		defaultRows: 2,
		Render: ({ workspaceId }) => <ActivityTile workspaceId={workspaceId} />,
	},
	{
		id: "customers",
		module: "client-records",
		name: "Customers",
		blurb: "How many people you hold a record for.",
		defaultCols: 1,
		defaultRows: 1,
		Render: ({ workspaceId }) => (
			<CountTile
				workspaceId={workspaceId}
				title="Customers"
				path="/clients"
				sub="on your books"
			/>
		),
	},
	{
		id: "products",
		module: "products-services",
		name: "Products",
		blurb: "How many things you sell.",
		defaultCols: 1,
		defaultRows: 1,
		Render: ({ workspaceId }) => (
			<CountTile
				workspaceId={workspaceId}
				title="Products"
				path="/catalog"
				sub="in your catalogue"
			/>
		),
	},
	{
		id: "invoices",
		module: "invoicing",
		name: "Invoices",
		blurb: "How many invoices exist.",
		defaultCols: 1,
		defaultRows: 1,
		Render: ({ workspaceId }) => (
			<CountTile
				workspaceId={workspaceId}
				title="Invoices"
				path="/invoices"
				sub="raised"
			/>
		),
	},
	{
		id: "bookings",
		module: "bookings",
		name: "Bookings",
		blurb: "Appointments on the books.",
		defaultCols: 1,
		defaultRows: 1,
		Render: ({ workspaceId }) => (
			<CountTile
				workspaceId={workspaceId}
				title="Bookings"
				path="/bookings"
				sub="scheduled"
			/>
		),
	},
];
