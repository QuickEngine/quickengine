import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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

/**
 * Seven days of takings, drawn as bars.
 *
 * 🔑 Bars rather than a line: a week is seven discrete days, and a line implies
 * a continuous quantity moving between them. Today is the last bar and is
 * deliberately dimmer — the day is not over, and a short final bar otherwise
 * reads as a collapse every morning.
 */
function Week({
	days,
	currency,
}: {
	days: Array<{ day: string; cents: number }>;
	currency: string;
}) {
	const peak = Math.max(...days.map((entry) => entry.cents), 1);
	return (
		<div className="flex h-16 items-end gap-1.5">
			{days.map((entry, index) => (
				<div key={entry.day} className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div
						className={`w-full rounded-[2px] ${
							index === days.length - 1
								? "bg-[rgb(var(--console-ink)/0.18)]"
								: "bg-[rgb(var(--console-ink)/0.32)]"
						}`}
						style={{
							height: `${Math.max((entry.cents / peak) * 44, entry.cents > 0 ? 3 : 1)}px`,
						}}
					/>
					<span className="truncate text-center text-[9px] text-[var(--ink-20)]">
						{new Date(`${entry.day}T00:00:00Z`).toLocaleDateString("en", {
							weekday: "narrow",
						})}
					</span>
				</div>
			))}
			<span className="sr-only">
				{days
					.map((entry) => `${entry.day}: ${money(entry.cents, currency)}`)
					.join(", ")}
			</span>
		</div>
	);
}

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
	const context = useQuery(quickDashQueries.context(workspace));
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
	const todayTotal = week[week.length - 1]?.cents ?? 0;

	// Guided setup, while it is still telling somebody something they do not know.
	const checklist = context.data?.checklist;
	const nextStep = checklist?.dismissed
		? null
		: (checklist?.items ?? [])
				.flatMap((goal) => goal.steps)
				.find((step) => step.isNext);
	const quiet = home.isSuccess && needsYou.length === 0 && now.length === 0;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
				<p className="text-[15px] text-[var(--ink-90)]">
					{context.data?.workspace.name ?? ""}
				</p>
				<p className="text-[11.5px] text-[var(--ink-30)]">
					{today.format(new Date())}
				</p>
			</div>

			{/* Money first. It is the question every owner opens the page with, and
			    it is the one number that needs no explanation. */}
			{weekTotal > 0 ? (
				<section className="mb-8">
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<p className="text-[26px] text-[var(--ink-90)] leading-none tabular-nums">
							{money(todayTotal, currency)}
						</p>
						<p className="text-[12px] text-[var(--ink-35)]">
							today · {money(weekTotal, currency)} this week
						</p>
					</div>
					<div className="mt-4 max-w-xs">
						<Week days={week} currency={currency} />
					</div>
				</section>
			) : null}

			{nextStep ? (
				<section className="mb-8">
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Getting started
					</p>
					<a
						href={nextStep.href}
						className="flex items-center gap-3 rounded-lg border border-[var(--console-line-strong)] bg-[var(--console-panel)] p-3.5 transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[12.5px] text-[var(--ink-85)]">
								{nextStep.label}
							</span>
							<span className="mt-0.5 block text-[11px] text-[var(--ink-30)] leading-4">
								{nextStep.description}
							</span>
						</span>
						<ArrowRightIcon
							size={13}
							className="shrink-0 text-[var(--ink-30)]"
						/>
					</a>
				</section>
			) : null}

			{home.isPending ? (
				<SkeletonRows rows={4} />
			) : home.isError ? (
				<RequestFailure
					error={home.error}
					onRetry={() => {
						void home.refetch();
					}}
				/>
			) : (
				<>
					{needsYou.length > 0 ? (
						<section className="mb-8">
							<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
								Needs you
								<span className="text-[var(--ink-25)]">
									{` · ${needsYou.reduce((sum, entry) => sum + entry.count, 0)}`}
								</span>
							</p>
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{needsYou.map((entry) => (
									<EntryRow
										key={entry.id}
										entry={entry}
										workspaceId={workspace}
									/>
								))}
							</div>
						</section>
					) : null}

					{now.length > 0 ? (
						<section className="mb-8">
							<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Today</p>
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{now.map((entry) => (
									<EntryRow
										key={entry.id}
										entry={entry}
										workspaceId={workspace}
									/>
								))}
							</div>
						</section>
					) : null}

					{/* 🔴 Said once, plainly. A dashboard that fills the space with charts
					    when there is nothing to do trains people to stop reading it. */}
					{quiet ? (
						<section className="mb-8">
							<p className="text-[13px] text-[var(--ink-75)]">
								Nothing needs you right now.
							</p>
							<p className="mt-1.5 max-w-md text-[11.5px] text-[var(--ink-30)] leading-5">
								Unfulfilled orders, overdue invoices, contracts waiting on a
								signature and low stock all appear here as soon as they happen.
							</p>
						</section>
					) : null}
				</>
			)}

			{traffic.data && (traffic.data.views ?? 0) > 0 ? (
				<section className="mb-8">
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Site traffic, last 7 days
					</p>
					<div className="flex gap-8 border-[var(--console-line-soft)] border-t py-3.5">
						{(
							[
								["Visitors", traffic.data.visitors],
								["Sessions", traffic.data.sessions],
								["Page views", traffic.data.views],
							] as const
						).map(([label, value]) => (
							<div key={label}>
								<p className="text-[18px] text-[var(--ink-85)] tabular-nums">
									{Number(value ?? 0).toLocaleString()}
								</p>
								<p className="text-[11px] text-[var(--ink-30)]">{label}</p>
							</div>
						))}
					</div>
				</section>
			) : null}

			{events.length > 0 ? (
				<section>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Recent</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{events.map((event) => (
							<div
								key={event.seq}
								className="flex items-baseline gap-4 py-2.5 text-[12px]"
							>
								<p className="min-w-0 flex-1 truncate text-[var(--ink-75)]">
									{eventLabel(event.name)}
								</p>
								<p className="w-20 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
									{since(String(event.occurredAt))}
								</p>
							</div>
						))}
					</div>
				</section>
			) : null}
		</main>
	);
}

export const Route = createFileRoute("/$workspace/")({ component: HomePage });
