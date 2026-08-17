import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import {
	accountQueries,
	type OrganizationRevenue,
	useActiveOrganization,
} from "../lib/account-api";

/**
 * Overview — what the organization earned.
 *
 * 🔑 A ledger, not a dashboard. The figure is set as type rather than boxed in a
 * card, the supporting numbers read as a sentence beside it, and the trend is one
 * line across the width. Nothing here is decorative: every value traces to a
 * payment row somebody can look up.
 *
 * 🔴 Currencies are never summed. Each one gets its own block, because adding
 * 100 USD to 100 EUR produces 200 of nothing and there is no rate table behind
 * this page to do it honestly.
 */

const RANGES = [
	{ days: 7, label: "7 days" },
	{ days: 30, label: "30 days" },
	{ days: 90, label: "90 days" },
] as const;

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat("en", {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
	}).format(cents / 100);

const dayLabel = (day: string) =>
	new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
		new Date(`${day}T00:00:00Z`),
	);

/** Every day in the window, whether or not money moved — a trend line with gaps
 * in it implies the business paused rather than that nobody bought anything. */
function fillDays(
	daily: OrganizationRevenue["daily"],
	currency: string,
	days: number,
	workspaceId?: string,
) {
	const byDay = new Map<string, number>();
	// 🔴 Defaulted, because the API and this app deploy SEPARATELY. During the
	// window where the frontend is newer, `daily` is simply absent — and
	// iterating undefined threw "t is not iterable" out of a minified bundle,
	// which took down the whole overview and locked people out of Account. A
	// missing field must degrade one chart, never the page.
	for (const row of daily ?? []) {
		if (row.currency !== currency) continue;
		if (workspaceId && row.workspaceId !== workspaceId) continue;
		byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.netCents);
	}
	const today = new Date();
	return Array.from({ length: days }, (_, index) => {
		const date = new Date(today.getTime() - (days - 1 - index) * 86_400_000);
		const day = date.toISOString().slice(0, 10);
		return { day, netCents: byDay.get(day) ?? 0 };
	});
}

/**
 * Count a number up to its value.
 *
 * 🔑 Money should arrive, not appear. The figure counting up is the difference
 * between a page that reports and a page that feels like a business running.
 *
 * Eased out over 900ms on `requestAnimationFrame`, and it re-runs whenever the
 * target changes — so a new payment landing visibly moves the number rather than
 * silently replacing it.
 *
 * ⚠️ Honours `prefers-reduced-motion` by jumping straight to the value. Somebody
 * who has asked the OS to stop animating things means it here too.
 */
function useCountUp(target: number, duration = 900) {
	const [value, setValue] = useState(target);
	const previous = useRef(target);

	useEffect(() => {
		const from = previous.current;
		previous.current = target;
		if (from === target) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setValue(target);
			return;
		}
		let frame = 0;
		const started = performance.now();
		const step = (now: number) => {
			const progress = Math.min((now - started) / duration, 1);
			// easeOutCubic: fast arrival, soft landing.
			const eased = 1 - (1 - progress) ** 3;
			setValue(Math.round(from + (target - from) * eased));
			if (progress < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [target, duration]);

	return value;
}

/** Every metered resource, in the order they matter to somebody running this. */
const METERS = [
	{ key: "apiRequests", label: "API requests", format: "count" },
	{ key: "storageBytes", label: "Storage", format: "bytes" },
	{ key: "seats", label: "Seats", format: "count" },
	{ key: "workspaces", label: "Workspaces", format: "count" },
	{ key: "aiActions", label: "AI actions", format: "count" },
	{ key: "webhookDeliveries", label: "Webhook deliveries", format: "count" },
] as const;

const planName = (id: string | undefined) =>
	(id ?? "free").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Credits are held in micros — a millionth of a dollar — so spend can be
 * recorded at the precision a model call actually costs. */
const creditBalance = (micros: number) =>
	new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
	}).format(micros / 1_000_000);

const compact = new Intl.NumberFormat("en", { notation: "compact" });

const bytes = (value: number) => {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = value;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit += 1;
	}
	return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
};

/** The figure, counting up to itself. */
function Headline({ cents, currency }: { cents: number; currency: string }) {
	const shown = useCountUp(cents);
	return (
		<p className="text-[34px] text-[var(--ink-90)] leading-none tabular-nums">
			{money(shown, currency)}
		</p>
	);
}

/** One line of the ledger: a label, the answer, and why it is the answer. */
function Fact({
	label,
	value,
	hint,
	warn = false,
}: {
	label: string;
	value: string;
	hint?: string;
	warn?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-4 py-3">
			<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-45)]">
				{label}
			</p>
			<p
				className={`shrink-0 text-[12.5px] tabular-nums ${warn ? "text-[#f5b44a]" : "text-[var(--ink-85)]"}`}
			>
				{value}
			</p>
			{hint ? (
				<p className="w-40 shrink-0 truncate text-right text-[11px] text-[var(--ink-25)]">
					{hint}
				</p>
			) : null}
		</div>
	);
}

/**
 * One metered resource against its limit.
 *
 * 🔴 An unlimited meter draws no bar. A full-width bar for "no limit" reads as
 * "at capacity", which is the opposite of what it means.
 */
function Meter({
	label,
	used,
	limit,
	state,
	format,
}: {
	label: string;
	used: number;
	limit: number | null;
	state: "ok" | "warn" | "over";
	format: "count" | "bytes";
}) {
	const show = (value: number) =>
		format === "bytes" ? bytes(value) : compact.format(value);
	const share = limit && limit > 0 ? Math.min(used / limit, 1) : null;
	const tone =
		state === "over"
			? "text-[#ff6b6b]"
			: state === "warn"
				? "text-[#f5b44a]"
				: "text-[var(--ink-85)]";

	return (
		<div className="py-3">
			<div className="flex items-baseline gap-4">
				<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-45)]">
					{label}
				</p>
				<p className={`shrink-0 text-[12.5px] tabular-nums ${tone}`}>
					{show(used)}
					<span className="text-[var(--ink-25)]">
						{limit === null ? " / no limit" : ` / ${show(limit)}`}
					</span>
				</p>
			</div>
			{share === null ? null : (
				<div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[rgb(var(--console-ink)/0.07)]">
					<div
						className={`h-full rounded-full ${
							state === "over"
								? "bg-[#ff6b6b]"
								: state === "warn"
									? "bg-[#f5b44a]"
									: "bg-[var(--ink-45)]"
						}`}
						style={{ width: `${Math.max(share * 100, 1)}%` }}
					/>
				</div>
			)}
		</div>
	);
}

/** The days the axis will cover, for labelling an empty chart. */
const zeroSeries = (days: number) =>
	Array.from({ length: days }, (_, index) =>
		new Date(Date.now() - (days - 1 - index) * 86_400_000)
			.toISOString()
			.slice(0, 10),
	);

/**
 * `order.paid` → `Order paid`.
 *
 * Deliberately generic rather than a per-event lookup: a new module's events
 * read correctly the day they ship instead of falling through to a raw key.
 * Rows written before the event rename carry a third segment
 * (`client_records.record.created`), so the first and last parts are taken.
 */
const eventLabel = (name: string) => {
	const parts = name.split(".");
	const subject = (parts[0] ?? name).replace(/_/g, " ");
	const verb = parts.length > 1 ? parts[parts.length - 1] : "";
	const head = subject.charAt(0).toUpperCase() + subject.slice(1);
	return verb ? `${head} ${verb.replace(/_/g, " ")}` : head;
};

const settledLabel = (value: string) => {
	const elapsed = Date.now() - new Date(value).getTime();
	const hours = Math.round(elapsed / 3_600_000);
	if (hours < 1) return "just now";
	if (hours < 24) return `${hours}h ago`;
	const dayCount = Math.round(hours / 24);
	return dayCount < 7
		? `${dayCount}d ago`
		: new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
			}).format(new Date(value));
};

/**
 * How this window compares with the one before it.
 *
 * 🔴 Silent when there is nothing honest to say. A percentage against zero is
 * infinite, and "+100%" off a single payment is a number that misleads more than
 * it informs, so both cases state the fact in words instead.
 */
function Change({
	current,
	previous,
	days,
}: {
	current: number;
	previous: number | undefined;
	days: number;
}) {
	if (previous === undefined) return null;
	const label = `vs previous ${days} days`;
	if (previous === 0) {
		return (
			<p className="text-[12px] text-[var(--ink-30)]">
				{current === 0 ? `nothing ${label}` : `first revenue ${label}`}
			</p>
		);
	}
	const change = ((current - previous) / Math.abs(previous)) * 100;
	const rounded = Math.abs(change) < 0.5 ? 0 : Math.round(change);
	if (rounded === 0) {
		return <p className="text-[12px] text-[var(--ink-30)]">flat {label}</p>;
	}
	return (
		<p className="text-[12px] text-[var(--ink-45)]">
			<span className="text-[var(--ink-75)]">
				{rounded > 0 ? "▲" : "▼"} {Math.abs(rounded)}%
			</span>{" "}
			<span className="text-[var(--ink-30)]">{label}</span>
		</p>
	);
}

/**
 * The trend, drawn as an area.
 *
 * Inline SVG on a `0 0 100 h` viewBox with `preserveAspectRatio="none"`, so it
 * stretches to whatever width it is given without a resize observer or a chart
 * library. `currentColor` throughout, which is what makes it follow the theme.
 */
function Trend({
	points,
	height = 120,
	className = "",
}: {
	points: Array<{ day: string; netCents: number }>;
	height?: number;
	className?: string;
}) {
	if (points.length < 2) return null;
	const values = points.map((point) => point.netCents);
	const max = Math.max(...values, 0);
	const min = Math.min(...values, 0);
	const span = max - min || 1;
	const x = (index: number) => (index / (points.length - 1)) * 100;
	const y = (value: number) => height - ((value - min) / span) * height;

	const at = (index: number) =>
		`${x(index)},${y(points[index]?.netCents ?? 0)}`;
	// 🔴 The last bucket is TODAY, and today is not over. Drawn solid it reads as
	// a collapse every morning — the line dives to whatever has settled by 2am.
	// So the completed days are the line, and today is a separate dimmed segment:
	// present, countable, and visibly still in progress.
	const settledLine = points
		.slice(0, -1)
		.map((_, index) => `${index === 0 ? "M" : "L"}${at(index)}`)
		.join(" ");
	const todayLine = `M${at(points.length - 2)} L${at(points.length - 1)}`;
	const line = points
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"}${x(index)},${y(point.netCents)}`,
		)
		.join(" ");
	const area = `${line} L100,${y(min)} L0,${y(min)} Z`;
	// Keyed on the shape so the draw replays whenever the range or the data
	// changes, rather than only on first mount.
	const drawKey = `${points.length}:${max}:${min}`;

	return (
		<svg
			viewBox={`0 0 100 ${height}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			className={`w-full text-[var(--ink-75)] ${className}`}
			style={{ height }}
		>
			<title>Net revenue trend</title>
			<path
				key={`area-${drawKey}`}
				className="trend-area"
				d={area}
				fill="currentColor"
				opacity={0.08}
			/>
			<path
				key={`line-${drawKey}`}
				className="trend-line"
				d={settledLine}
				fill="none"
				stroke="currentColor"
				strokeWidth={1}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={todayLine}
				fill="none"
				stroke="currentColor"
				strokeWidth={1}
				strokeLinecap="round"
				strokeDasharray="2 2"
				opacity={0.45}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function OverviewPage() {
	const { active } = useActiveOrganization();
	const [days, setDays] = useState<number>(30);
	const revenue = useQuery(accountQueries.revenue(active?.id ?? "", days));
	// The window immediately before this one, same length. A figure with nothing
	// to compare it to says how much, never whether that is good.
	const previous = useQuery(
		accountQueries.revenue(active?.id ?? "", days, days),
	);
	const settlements = useQuery(accountQueries.settlements(active?.id ?? "", 8));
	// Only for the zero state: which businesses this page will break down once
	// money starts arriving.
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));
	const activity = useQuery(accountQueries.activity(active?.id ?? "", 12));
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	const credits = useQuery(accountQueries.credits(active?.id ?? ""));
	const members = useQuery(accountQueries.members(active?.id ?? ""));
	const invitations = useQuery(accountQueries.invitations(active?.id ?? ""));

	const activeWorkspaces = (workspaces.data?.items ?? []).filter(
		(workspace) => !workspace.archivedAt,
	);
	const testWorkspaces = activeWorkspaces.filter(
		(workspace) => workspace.environment === "test",
	).length;
	const modulesEnabled = activeWorkspaces.reduce(
		(sum, workspace) => sum + workspace.modules.length,
		0,
	);
	const pendingInvitations = (invitations.data?.items ?? []).filter(
		(invitation) => invitation.status === "pending",
	).length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-6 flex items-center justify-between gap-4">
				<p className="text-[12.5px] text-[var(--ink-45)]">Net revenue</p>
				<div className="flex items-center gap-1">
					{RANGES.map((range) => (
						<button
							key={range.days}
							type="button"
							aria-pressed={days === range.days}
							onClick={() => setDays(range.days)}
							className={`h-7 rounded-full px-2.5 text-[11.5px] outline-none transition-colors ${
								days === range.days
									? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-85)]"
									: "text-[var(--ink-35)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-70)]"
							}`}
						>
							{range.label}
						</button>
					))}
				</div>
			</div>

			{revenue.isPending ? (
				<SkeletonRows rows={4} />
			) : revenue.isError ? (
				<RequestFailure
					error={revenue.error}
					onRetry={() => {
						void revenue.refetch();
					}}
				/>
			) : revenue.data.totals.length === 0 ? (
				/* The real layout at zero, not a message where the page should be.
				   Somebody who has not sold anything yet should be able to see exactly
				   what this page will tell them once they have. */
				<section className="mb-10">
					<div className="flex flex-wrap items-baseline gap-3">
						<p className="text-[34px] text-[var(--ink-30)] leading-none tabular-nums">
							0.00
						</p>
						<p className="text-[12px] text-[var(--ink-30)]">
							no payments settled yet
						</p>
					</div>
					<p className="mt-2.5 text-[12px] text-[var(--ink-25)]">
						collected 0.00 · refunded 0.00 · 0 payments
					</p>

					<div className="mt-6">
						<Trend
							points={Array.from({ length: days }, (_, index) => ({
								day: String(index),
								netCents: 0,
							}))}
							className="text-[var(--ink-20)]"
						/>
						<div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--ink-20)]">
							<span>{dayLabel(zeroSeries(days)[0] ?? "")}</span>
							<span>{dayLabel(zeroSeries(days).at(-1) ?? "")}</span>
						</div>
					</div>

					<div className="mt-7 divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{(workspaces.data?.items ?? [])
							.filter((workspace) => !workspace.archivedAt)
							.map((workspace) => (
								<div
									key={workspace.id}
									className="flex items-center gap-4 py-3"
								>
									<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-45)]">
										{workspace.name}
									</p>
									<p className="w-28 shrink-0 text-right text-[12.5px] text-[var(--ink-30)] tabular-nums">
										0.00
									</p>
									<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-25)]">
										0 payments
									</p>
								</div>
							))}
					</div>
				</section>
			) : (
				revenue.data.totals.map((total) => {
					const series = fillDays(revenue.data.daily, total.currency, days);
					const workspaces = revenue.data.workspaces
						.filter((row) => row.currency === total.currency)
						.sort((a, b) => b.netCents - a.netCents);
					return (
						<section key={total.currency} className="mb-10">
							<div className="flex flex-wrap items-baseline gap-3">
								<Headline cents={total.netCents} currency={total.currency} />
								<Change
									current={total.netCents}
									previous={
										previous.data?.totals.find(
											(row) => row.currency === total.currency,
										)?.netCents
									}
									days={days}
								/>
							</div>
							<p className="mt-2.5 text-[12px] text-[var(--ink-40)]">
								collected {money(total.collectedCents, total.currency)} ·
								refunded {money(total.refundedCents, total.currency)} ·{" "}
								{total.paymentCount} payment
								{total.paymentCount === 1 ? "" : "s"}
							</p>

							<div className="mt-6">
								<Trend points={series} />
								<div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--ink-25)]">
									<span>{dayLabel(series[0]?.day ?? "")}</span>
									<span>today, so far</span>
								</div>
							</div>

							<div className="mt-7 divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{workspaces.map((row) => (
									<div
										key={row.workspaceId}
										className="flex items-center gap-4 py-3"
									>
										<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
											{row.workspaceName}
										</p>
										<div className="w-24 shrink-0">
											<Trend
												points={fillDays(
													revenue.data.daily,
													total.currency,
													days,
													row.workspaceId,
												)}
												height={20}
												className="text-[var(--ink-45)]"
											/>
										</div>
										<p className="w-28 shrink-0 text-right text-[12.5px] text-[var(--ink-85)] tabular-nums">
											{money(row.netCents, total.currency)}
										</p>
										<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
											{row.paymentCount} payment
											{row.paymentCount === 1 ? "" : "s"}
										</p>
									</div>
								))}
							</div>
						</section>
					);
				})
			)}

			{settlements.data && settlements.data.items.length > 0 ? (
				<section>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Recent settlements
					</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{settlements.data.items.map((payment, index) => (
							<div
								key={payment.id}
								style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
								className="settle-in flex items-center gap-4 py-2.5 text-[12px]"
							>
								<p className="w-28 shrink-0 text-[var(--ink-85)] tabular-nums">
									{money(payment.amountCents, payment.currency)}
								</p>
								<p className="min-w-0 flex-1 truncate text-[var(--ink-45)]">
									{payment.clientName ?? "Guest"}
									<span className="text-[var(--ink-25)]">
										{" · "}
										{payment.workspaceName}
									</span>
								</p>
								{payment.status === "refunded" ? (
									<span className="shrink-0 text-[11px] text-[var(--ink-45)]">
										refunded
									</span>
								) : null}
								{payment.environment === "test" ? (
									<span className="shrink-0 text-[11px] text-[#f5b44a]">
										test
									</span>
								) : null}
								<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
									{settledLabel(payment.settledAt)}
								</p>
							</div>
						))}
					</div>
				</section>
			) : null}
			{activity.data && activity.data.items.length > 0 ? (
				<section className="mt-10">
					<div className="mb-1 flex items-center gap-2">
						<p className="text-[12.5px] text-[var(--ink-45)]">Live activity</p>
						{/* Proof the page is watching, not a decoration: it only pulses
						    while the poll is actually running. */}
						<span
							className={`size-1.5 rounded-full bg-[var(--ink-45)] ${
								activity.isFetching ? "live-pulse" : "opacity-30"
							}`}
						/>
					</div>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{activity.data.items.map((event, index) => (
							<div
								key={event.id}
								style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
								className="settle-in flex items-center gap-4 py-2.5 text-[12px]"
							>
								<p className="min-w-0 flex-1 truncate text-[var(--ink-85)]">
									{eventLabel(event.name)}
									<span className="text-[var(--ink-25)]">
										{" · "}
										{event.workspaceName}
									</span>
								</p>
								<p className="w-24 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
									{settledLabel(event.occurredAt)}
								</p>
							</div>
						))}
					</div>
				</section>
			) : null}

			<section className="mt-10 grid gap-10 lg:grid-cols-2">
				<div>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Plan and credits
					</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						<Fact
							label="Plan"
							value={planName(plan.data?.planId)}
							hint={plan.data?.subscription ? "subscribed" : "no subscription"}
						/>
						<Fact
							label="Credits"
							value={
								credits.data ? creditBalance(credits.data.balanceMicros) : "—"
							}
							hint={
								credits.data?.autoRecharge?.enabled
									? `auto-recharge on at ${creditBalance(credits.data.autoRecharge.thresholdMicros)}`
									: "auto-recharge off"
							}
							/* A failed recharge is the one thing here that stops the
							   product working, so it is the one thing that gets said
							   loudly rather than filed under a hint. */
							warn={Boolean(credits.data?.autoRecharge?.lastFailureAt)}
						/>
					</div>
					{credits.data?.autoRecharge?.lastFailureAt ? (
						<p className="mt-2 text-[11px] text-[#f5b44a]">
							Last auto-recharge failed
							{credits.data.autoRecharge.lastFailureReason
								? `: ${credits.data.autoRecharge.lastFailureReason}`
								: "."}
						</p>
					) : null}

					{/* The rest of the left column. Plan and credits alone left a hole
					    beside six meters, and these are the other facts somebody
					    running this organization checks without being asked. */}
					<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
						Organization
					</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						<Fact
							label="Workspaces"
							value={String(activeWorkspaces.length)}
							hint={
								testWorkspaces > 0
									? `${testWorkspaces} in test mode`
									: "all live"
							}
						/>
						<Fact
							label="Modules enabled"
							value={String(modulesEnabled)}
							hint={`across ${activeWorkspaces.length} workspace${
								activeWorkspaces.length === 1 ? "" : "s"
							}`}
						/>
						<Fact
							label="People"
							value={String(members.data?.items.length ?? 0)}
							hint={
								(members.data?.items ?? []).filter(
									(member) => member.role === "owner",
								).length === 1
									? "1 owner"
									: `${(members.data?.items ?? []).filter((member) => member.role === "owner").length} owners`
							}
						/>
						<Fact
							label="Pending invitations"
							value={String(pendingInvitations)}
							hint={
								pendingInvitations > 0 ? "awaiting acceptance" : "none open"
							}
							warn={pendingInvitations > 0}
						/>
					</div>
				</div>

				<div>
					<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
						Usage this period
					</p>
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{METERS.map((meter) => {
							const row = plan.data?.usage?.[meter.key];
							return (
								<Meter
									key={meter.key}
									label={meter.label}
									used={row?.used ?? 0}
									limit={row?.limit ?? null}
									state={row?.state ?? "ok"}
									format={meter.format}
								/>
							);
						})}
					</div>
				</div>
			</section>
		</main>
	);
}

export const Route = createFileRoute("/")({ component: OverviewPage });
