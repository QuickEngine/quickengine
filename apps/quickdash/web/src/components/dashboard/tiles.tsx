import { ArrowRightIcon } from "@phosphor-icons/react";
import { presentRequestError } from "@quickengine/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { workspaceApi } from "../../lib/api";
import { type HomeEntry, quickDashQueries } from "../../lib/quickdash-api";
import { Area, Bars, Card, Stat } from "../dash-card";
import { RequestIdInline } from "../outlet-error";
import { RequestFailure } from "../page-state";
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
	Render: (props: { workspaceId: string; workspace: string }) => ReactNode;
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
function useWeek(workspaceId: string) {
	const revenue = useQuery({
		queryKey: ["quickdash", workspaceId, "week"],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - 6 * 86_400_000);
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
	}>;
	const byDay = new Map<string, number>();
	for (const row of collected) {
		const day = row.bucket.slice(0, 10);
		byDay.set(day, (byDay.get(day) ?? 0) + Number(row.amountCents ?? 0));
	}
	const week = Array.from({ length: 7 }, (_, index) => {
		const date = new Date(Date.now() - (6 - index) * 86_400_000);
		const day = date.toISOString().slice(0, 10);
		return { day, cents: byDay.get(day) ?? 0 };
	});

	return {
		query: revenue,
		week,
		currency: collected[0]?.currency ?? "USD",
	};
}

function RevenueTile({ workspaceId }: { workspaceId: string }) {
	const { query, week, currency } = useWeek(workspaceId);
	const total = week.reduce((sum, entry) => sum + entry.cents, 0);
	const today = week[week.length - 1]?.cents ?? 0;

	return (
		<Card title="Revenue, last 7 days">
			{query.isPending ? (
				<SkeletonRows rows={3} />
			) : query.isError ? (
				<RequestFailure error={query.error} onRetry={() => query.refetch()} />
			) : (
				<>
					<Stat
						value={money(today, currency)}
						sub={`${money(total, currency)} this week`}
					/>
					<div className="mt-4">
						<Area points={week.map((entry) => entry.cents)} height={92} />
					</div>
				</>
			)}
		</Card>
	);
}

function OrdersTile({ workspaceId }: { workspaceId: string }) {
	const { week } = useWeek(workspaceId);
	return (
		<Card title="Orders this week">
			<Stat
				value={String(week.filter((entry) => entry.cents > 0).length)}
				sub="days with a sale"
			/>
			<div className="mt-4">
				<Bars
					points={week.map((entry) => entry.cents)}
					labels={week.map((entry) => entry.day.slice(5))}
					height={68}
				/>
			</div>
		</Card>
	);
}

function TrafficTile({ workspaceId }: { workspaceId: string }) {
	const traffic = useQuery({
		queryKey: ["quickdash", workspaceId, "traffic-summary"],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - 6 * 86_400_000);
			from.setHours(0, 0, 0, 0);
			return (
				await workspaceApi(workspaceId).reports.trafficSummary({
					from,
					to,
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
				})
			).data;
		},
	});
	const views = Number(traffic.data?.views ?? 0);
	return (
		<Card title="Site traffic, last 7 days">
			{/* 🔑 Traffic is self-reported by the customer's own site, so a workspace
			    with no site reporting has NONE. That is absence, not zero. */}
			{views === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					Nothing reported yet. Your site sends this once QuickConnect is
					installed.
				</p>
			) : (
				<Stat
					value={Number(traffic.data?.visitors ?? 0).toLocaleString()}
					sub={`${Number(traffic.data?.sessions ?? 0).toLocaleString()} sessions · ${views.toLocaleString()} views`}
				/>
			)}
		</Card>
	);
}

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
			params={{ workspace: workspaceId, module: entry.id.split(":")[0] }}
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
				<div className="flex flex-col">
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
				<div className="flex flex-col">
					{rows.map((entry) => (
						<EntryRow key={entry.id} entry={entry} workspaceId={workspace} />
					))}
				</div>
			)}
		</Card>
	);
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
				<div className="flex flex-col">
					{events.map((row) => (
						<div
							key={row.id}
							className="flex items-center justify-between gap-3 py-2"
						>
							<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-75)]">
								{row.name}
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
		Render: ({ workspaceId }) => <RevenueTile workspaceId={workspaceId} />,
	},
	{
		id: "orders-week",
		module: "orders",
		name: "Orders this week",
		blurb: "How many days took a sale, day by day.",
		defaultCols: 2,
		defaultRows: 2,
		Render: ({ workspaceId }) => <OrdersTile workspaceId={workspaceId} />,
	},
	{
		id: "traffic",
		module: "reporting-analytics",
		name: "Site traffic",
		blurb: "Visitors, sessions and views from your own site.",
		defaultCols: 1,
		defaultRows: 1,
		Render: ({ workspaceId }) => <TrafficTile workspaceId={workspaceId} />,
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
