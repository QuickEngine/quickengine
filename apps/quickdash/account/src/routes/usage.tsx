import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

/**
 * Usage — what this organization has consumed against what its plan allows.
 *
 * 🔑 The question this page answers is "am I about to be stopped", so the meters
 * that are close to their limit come FIRST and everything comfortable sinks
 * below them. A fixed order looks tidier and buries the one line that matters.
 *
 * 🔴 An unlimited meter draws no bar. A full-width bar for "no limit" reads as
 * "at capacity", which is the exact opposite of what it means.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85";

/** What each meter actually costs when it runs out, in the operator's terms. */
const METERS = [
	{
		key: "apiRequests",
		label: "API requests",
		format: "count",
		consequence: "Your website and apps stop being answered.",
	},
	{
		key: "storageBytes",
		label: "Storage",
		format: "bytes",
		consequence: "New uploads are refused. Existing files stay.",
	},
	{
		key: "seats",
		label: "Seats",
		format: "count",
		consequence: "Nobody else can accept an invitation.",
	},
	{
		key: "workspaces",
		label: "Workspaces",
		format: "count",
		consequence: "No new workspace can be created.",
	},
	{
		key: "aiActions",
		label: "AI actions",
		format: "count",
		consequence: "AI features stop running until the period resets.",
	},
	{
		key: "webhookDeliveries",
		label: "Webhook deliveries",
		format: "count",
		consequence: "Outbound webhooks stop being delivered.",
	},
] as const;

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

const planName = (id: string | undefined) =>
	(id ?? "free").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function UsagePage() {
	const { active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));

	const usage = plan.data?.usage ?? {};
	const rows = METERS.map((meter) => {
		const row = usage[meter.key];
		const used = row?.used ?? 0;
		const limit = row?.limit ?? null;
		return {
			...meter,
			used,
			limit,
			state: row?.state ?? ("ok" as const),
			share: limit && limit > 0 ? Math.min(used / limit, 1) : null,
		};
	}).sort((a, b) => (b.share ?? -1) - (a.share ?? -1));

	const pressing = rows.filter((row) => row.state !== "ok");

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
					This period, against the {planName(plan.data?.planId)} plan. Counters
					reset each billing period; storage, seats and workspaces are what you
					are using right now.
				</p>
				<Link to="/billing" className={primaryAction}>
					{pressing.length > 0 ? "Upgrade plan" : "View plan"}
				</Link>
			</div>

			{/* 🔴 The reason somebody opened this page, stated once at the top rather
			    than left to be spotted in a list of six bars. */}
			{pressing.length > 0 ? (
				<div className="mb-6 rounded-lg border border-[var(--signal-attention)]/30 bg-[var(--signal-attention)]/[0.06] p-4">
					<p className="text-[12px] text-[var(--signal-attention-text)]">
						{pressing.some((row) => row.state === "over")
							? "You have passed a limit."
							: "You are close to a limit."}
					</p>
					<div className="mt-1.5 flex flex-col gap-0.5">
						{pressing.map((row) => (
							<p key={row.key} className="text-[11.5px] text-[var(--ink-45)]">
								<span className="text-[var(--ink-75)]">{row.label}</span> —{" "}
								{row.consequence}
							</p>
						))}
					</div>
				</div>
			) : null}

			{plan.isPending ? (
				<SkeletonRows rows={4} />
			) : plan.isError ? (
				<RequestFailure
					error={plan.error}
					onRetry={() => {
						void plan.refetch();
					}}
				/>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{rows.map((row) => {
						const show = (value: number) =>
							row.format === "bytes" ? bytes(value) : compact.format(value);
						const tone =
							row.state === "over"
								? "text-[var(--signal-failure-text)]"
								: row.state === "warn"
									? "text-[var(--signal-attention-text)]"
									: "text-[var(--ink-85)]";
						return (
							<div key={row.key} className="py-3.5">
								<div className="flex items-baseline gap-4">
									<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-60)]">
										{row.label}
									</p>
									<p className={`shrink-0 text-[12.5px] tabular-nums ${tone}`}>
										{show(row.used)}
										<span className="text-[var(--ink-25)]">
											{row.limit === null
												? " / no limit"
												: ` / ${show(row.limit)}`}
										</span>
									</p>
								</div>
								{row.share === null ? null : (
									<div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[rgb(var(--console-ink)/0.07)]">
										<div
											className={`h-full rounded-full transition-[width] duration-500 ${
												row.state === "over"
													? "bg-[var(--signal-failure)]"
													: row.state === "warn"
														? "bg-[var(--signal-attention)]"
														: "bg-[var(--ink-45)]"
											}`}
											style={{ width: `${Math.max(row.share * 100, 1)}%` }}
										/>
									</div>
								)}
								{row.state !== "ok" ? (
									<p className="mt-1.5 text-[11px] text-[var(--ink-35)]">
										{row.consequence}
									</p>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/usage")({ component: UsagePage });
