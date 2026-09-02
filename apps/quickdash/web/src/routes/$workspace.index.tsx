import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Area, Bars, Card, Stat } from "../components/dash-card";
import { useHeaderRail } from "../components/header-action";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import { workspaceApi } from "../lib/api";
import type { HomeEntry } from "../lib/quickdash-api";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * Home — what needs you in this workspace today.
 *
 * 🔑 **A work queue, not a stat wall.** Every line names records and links at
 * them; a number you cannot act on is decoration. The counts come from one
 * server call assembled out of the ENABLED modules, so this page never mentions
 * a module this business does not have.
 *
 * 🔴 **Empty sections disappear.** A workspace with nothing wrong shows no
 * "needs you" block at all — that absence is the message, and a row of zeroes
 * would bury the day it stops being zero.
 */

/** How each concern reads, and which module owns it. */
const CONCERNS: Readonly<
	Record<string, { module: string; one: string; many: string }>
> = {
	"orders.unfulfilled": {
		module: "orders",
		one: "paid order not fulfilled",
		many: "paid orders not fulfilled",
	},
	"invoices.overdue": {
		module: "invoicing",
		one: "invoice overdue",
		many: "invoices overdue",
	},
	"contracts.awaiting": {
		module: "contracts-esign",
		one: "contract awaiting signature",
		many: "contracts awaiting signature",
	},
	"inventory.low": {
		module: "inventory",
		one: "product below its low-stock mark",
		many: "products below their low-stock mark",
	},
	"bookings.today": {
		module: "bookings",
		one: "booking today",
		many: "bookings today",
	},
	"payments.pending": {
		module: "payments",
		one: "payment taken but not settled",
		many: "payments taken but not settled",
	},
	"quotes.awaiting": {
		module: "quotes-estimates",
		one: "quote waiting on an answer",
		many: "quotes waiting on an answer",
	},
	"tasks.due": {
		module: "projects-tasks",
		one: "task due",
		many: "tasks due",
	},
};

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat("en", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);

const today = new Intl.DateTimeFormat("en", {
	weekday: "long",
	day: "numeric",
	month: "long",
});

/** `order.paid` → `Order paid`. Generic, so a new module's events read properly
 * the day they ship rather than falling through to a raw key. */
const eventLabel = (name: string) => {
	const parts = name.split(".");
	const subject = (parts[0] ?? name).replace(/_/g, " ");
	const verb = parts.length > 1 ? parts[parts.length - 1] : "";
	const head = subject.charAt(0).toUpperCase() + subject.slice(1);
	return verb ? `${head} ${verb.replace(/_/g, " ")}` : head;
};

const since = (value: string) => {
	const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
};

function EntryRow({
	entry,
	workspaceId,
}: {
	entry: HomeEntry;
	workspaceId: string;
}) {
	const concern = CONCERNS[entry.id];
	if (!concern) return null;
	return (
		<Link
			to="/$workspace/$module"
			params={{ workspace: workspaceId, module: concern.module }}
			className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 outline-none"
		>
			<p className="text-[12.5px] text-[var(--ink-85)]">
				<span className="tabular-nums">{entry.count}</span>{" "}
				{entry.count === 1 ? concern.one : concern.many}
			</p>
			{/* Naming a few is what turns a count into work you recognise. */}
			<p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-30)]">
				{entry.samples
					.map((sample) =>
						sample.detail ? `${sample.label} · ${sample.detail}` : sample.label,
					)
					.join("   ")}
				{entry.count > entry.samples.length
					? `   +${entry.count - entry.samples.length} more`
					: ""}
			</p>
			<ArrowRightIcon
				size={12}
				className="shrink-0 text-[var(--ink-25)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink-60)]"
			/>
		</Link>
	);
}

function HomePage() {
	const { workspaceId: workspace } = Route.useRouteContext();
	const { rail } = useHeaderRail();
	const home = useQuery(quickDashQueries.home(workspace));
	// Seven days of settled money, from the workspace's own reporting.
	const revenue = useQuery({
		queryKey: ["quickdash", workspace, "week"],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - 6 * 86_400_000);
			from.setHours(0, 0, 0, 0);
			return (
				await workspaceApi(workspace).reports.revenue({
					from,
					to,
					granularity: "day",
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
				})
			).data;
		},
	});

	/**
	 * How busy the site has been.
	 *
	 * 🔑 Lives on Home rather than in a section of its own. Everything else in
	 * QuickDash is something a person OPERATES — orders to fulfil, stock to
	 * count. Traffic and revenue are things they READ about the workspace as a
	 * whole, which is what Home already is; a separate "Insight" group buried
	 * the numbers an owner opens most below eight groups of chores.
	 *
	 * ⚠️ Traffic is self-reported by the customer's own site, so a workspace with
	 * no site reporting has none. That is absence, not zero, and the section
	 * simply does not render.
	 */
	const traffic = useQuery({
		queryKey: ["quickdash", workspace, "traffic-summary"],
		queryFn: async () => {
			const to = new Date();
			const from = new Date(to.getTime() - 6 * 86_400_000);
			from.setHours(0, 0, 0, 0);
			return (
				await workspaceApi(workspace).reports.trafficSummary({
					from,
					to,
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
				})
			).data;
		},
	});

	const activity = useQuery({
		queryKey: ["quickdash", workspace, "activity"],
		queryFn: async () =>
			(await workspaceApi(workspace).activity.list({ limit: 8 })).data,
	});

	const needsYou = home.data?.needsYou ?? [];
	const now = home.data?.today ?? [];
	const events = activity.data?.events ?? [];

	// The series only carries days that saw money; the strip needs all seven.
	// The SDK types `amountCents` loosely because Postgres returns a sum as text;
	// normalising once here keeps the arithmetic honest.
	const collected = (revenue.data?.collected ?? []) as Array<{
		bucket: string;
		currency: string;
		amountCents: string | number | undefined;
	}>;
	const currency = collected[0]?.currency ?? "USD";
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
	const weekTotal = week.reduce((sum, entry) => sum + entry.cents, 0);
	// ⚠️ `reduce`, not a sort: sorting would reorder the array the chart draws
	// from, and the chart has to stay in day order.
	const bestDay = week.reduce(
		(best, entry) => (entry.cents > best.cents ? entry : best),
		week[0] ?? { day: "", cents: 0 },
	);
	const todayTotal = week[week.length - 1]?.cents ?? 0;

	const quiet = home.isSuccess && needsYou.length === 0 && now.length === 0;

	/**
	 * 🔴 What stops the bento ending in a hole.
	 *
	 * `grid-flow-dense` backfills gaps with anything that FITS, and the last
	 * tile is full width — a four-column card cannot drop into a two-cell tail,
	 * so it starts a fresh row and leaves the tail empty. Nothing in CSS can see
	 * that coming; the count can.
	 *
	 * Six tiles always render, plus one for each of "needs you", "today" and the
	 * quiet notice — which is 6, 7 or 8. The remainder against four columns says
	 * how much of the last row is short, and the final tiles widen to close it:
	 * three short → 2·1·1, two short → 2·2, none → every tile one cell.
	 *
	 * ⚠️ Whole class strings, never `lg:col-span-${n}`. Tailwind reads source
	 * text, so a name assembled at runtime is never generated.
	 */
	const tail =
		(6 +
			(needsYou.length > 0 ? 1 : 0) +
			(now.length > 0 ? 1 : 0) +
			(quiet ? 1 : 0)) %
		4;
	const tail3 = tail === 3 ? "lg:col-span-2" : "";
	const tail2 = tail === 2 ? "sm:col-span-2 lg:col-span-2" : "";

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{/*
			 * 🔴 A GRID of one card component, not a stack of bespoke sections.
			 *
			 * Home was a column of headings with a number under each, which reads as
			 * a report rather than a dashboard — everything the same weight, nothing
			 * answerable at a glance. As tiles, size carries meaning: money is wide
			 * because it is the question the page is opened with, and the rest are
			 * equal because none of them outranks another.
			 *
			 * ⚠️ `auto-rows-min`, so a card is as tall as its contents rather than
			 * stretching to match the tallest in its row. Stretched cards leave one
			 * with a band of empty panel under it, which reads as missing data.
			 */}
			{/*
			 * 🔴 No workspace name here. The switcher names it, the breadcrumb
			 * names the page, and a heading repeating the switcher is a third
			 * answer to a question already answered twice above it.
			 *
			 * 🔑 The date rides the breadcrumb row instead of a line of its own,
			 * the same way a list page's controls do. "Home" and "today" are one
			 * statement about where you are, and giving the date its own row cost
			 * a band of empty page above the first card.
			 */}
			{rail
				? createPortal(
						<p className="text-[11.5px] text-[var(--ink-30)]">
							{today.format(new Date())}
						</p>,
						rail,
					)
				: null}

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[minmax(6.5rem,auto)] lg:grid-flow-dense lg:grid-cols-4">
				{/* Money, across the top. The one number that needs no explaining. */}
				<Card
					title="Revenue, last 7 days"
					className="sm:col-span-2 lg:col-span-2 lg:row-span-2"
				>
					{revenue.isPending ? (
						<SkeletonRows rows={3} />
					) : revenue.isError ? (
						<RequestFailure
							error={revenue.error}
							onRetry={() => revenue.refetch()}
						/>
					) : (
						<>
							<Stat
								value={money(todayTotal, currency)}
								sub={`${money(weekTotal, currency)} this week`}
							/>
							<div className="mt-4">
								<Area points={week.map((entry) => entry.cents)} height={92} />
							</div>
						</>
					)}
				</Card>

				{/* 🔑 Traffic is self-reported by the customer's own site, so a
				    workspace with no site reporting has NONE. That is absence, not
				    zero, and the card does not render rather than showing a row of
				    zeroes that would read as a bad week. */}
				{traffic.data && (traffic.data.views ?? 0) > 0 ? (
					<Card title="Site traffic, last 7 days">
						<Stat
							value={(traffic.data.visitors ?? 0).toLocaleString()}
							sub={`${(traffic.data.sessions ?? 0).toLocaleString()} sessions · ${(traffic.data.views ?? 0).toLocaleString()} views`}
						/>
					</Card>
				) : (
					<Card title="Orders, last 7 days">
						<Stat
							value={String(week.filter((entry) => entry.cents > 0).length)}
							sub="days with a sale"
						/>
						<div className="mt-4">
							<Bars
								points={week.map((entry) => entry.cents)}
								labels={week.map((entry) => entry.day)}
								height={68}
							/>
						</div>
					</Card>
				)}

				{/* 🔴 No setup step here. Getting started is its own surface, not a
				    tile competing with the day's work — a dashboard that is half
				    onboarding is neither. */}

				{needsYou.length > 0 ? (
					<Card title="Needs you">
						<div className="flex flex-col">
							{needsYou.map((entry) => (
								<EntryRow
									key={entry.id}
									entry={entry}
									workspaceId={workspace}
								/>
							))}
						</div>
					</Card>
				) : null}

				{now.length > 0 ? (
					<Card title="Today">
						<div className="flex flex-col">
							{now.map((entry) => (
								<EntryRow
									key={entry.id}
									entry={entry}
									workspaceId={workspace}
								/>
							))}
						</div>
					</Card>
				) : null}

				{quiet ? (
					<Card title="Nothing waiting">
						<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
							No orders to fulfil, no messages to answer and nothing running
							low. This is what a caught-up workspace looks like.
						</p>
					</Card>
				) : null}

				{/*
				 * 🔑 Derived from data the page ALREADY has, not from new requests.
				 *
				 * A dashboard earns its tiles by answering more questions from the
				 * same fetch, not by making six more round trips on load. Every card
				 * below reads the revenue series or the home payload that were needed
				 * anyway — so adding them costs nothing at load and nothing can be
				 * half-loaded relative to its neighbour.
				 */}
				<Card title="Best day">
					<Stat
						value={money(bestDay.cents, currency)}
						sub={
							bestDay.cents > 0
								? new Date(`${bestDay.day}T00:00:00`).toLocaleDateString([], {
										weekday: "long",
									})
								: "No sales yet this week"
						}
					/>
				</Card>

				<Card title="Daily average">
					<Stat
						value={money(Math.round(weekTotal / 7), currency)}
						sub="across the last 7 days"
					/>
				</Card>

				{/* ⚠️ Compared against the SAME length of time, not against a calendar
				    week. Comparing three days to seven is how a dashboard reports a
				    collapse every Monday morning. */}
				<Card title="Sales days" className={tail3}>
					<Stat
						value={`${week.filter((entry) => entry.cents > 0).length} of 7`}
						sub="days that took money"
					/>
					<div className="mt-4">
						<Bars
							points={week.map((entry) => entry.cents)}
							labels={week.map((entry) => entry.day)}
							height={52}
						/>
					</div>
				</Card>

				<Card title="Waiting on you" className={tail2}>
					<Stat
						value={String(needsYou.length)}
						sub={
							needsYou.length === 0
								? "Nothing outstanding"
								: needsYou.length === 1
									? "one thing to deal with"
									: "things to deal with"
						}
					/>
				</Card>

				<Card title="Happening today" className={tail2}>
					<Stat
						value={String(now.length)}
						sub={now.length === 0 ? "A quiet day so far" : "on today"}
					/>
				</Card>

				{/* 🔴 No "Workspace" tile. The sidebar lists every module you have and
				    sandbox repaints the whole console — a card restating both spent
				    a slot on two facts that are impossible to miss already. */}

				<Card
					title="Recent activity"
					className="sm:col-span-2 lg:col-span-4 lg:row-span-2"
				>
					{activity.isPending ? (
						<SkeletonRows rows={4} />
					) : activity.isError ? (
						<RequestFailure
							error={activity.error}
							onRetry={() => activity.refetch()}
						/>
					) : events.length > 0 ? (
						<div className="flex flex-col gap-1.5">
							{events.slice(0, 6).map((event) => (
								<div
									key={event.seq}
									className="flex min-w-0 items-baseline justify-between gap-4"
								>
									<p className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-70)]">
										{eventLabel(event.name)}
									</p>
									<p className="shrink-0 text-[11px] text-[var(--ink-25)] tabular-nums">
										{since(String(event.occurredAt))}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-[11.5px] text-[var(--ink-30)]">
							Nothing has happened here yet.
						</p>
					)}
				</Card>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/")({ component: HomePage });
