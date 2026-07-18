import {
	getWorkspaceReport,
	reportingAnalyticsSettingsSchema,
} from "@quickengine/mod-reporting-analytics";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ModulePageProps } from "./types";

const RANGE_PRESETS = [7, 30, 90, 365] as const;
const GRANULARITIES = ["day", "week", "month"] as const;
type Granularity = (typeof GRANULARITIES)[number];

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

function money(cents: string, currency: string) {
	const value = Number(cents) / 100;
	try {
		return new Intl.NumberFormat("en", {
			style: "currency",
			currency,
		}).format(value);
	} catch {
		return `${currency} ${value.toFixed(2)}`;
	}
}

function Card({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="rounded-xl border p-4">
			<h2 className="font-medium text-sm">{title}</h2>
			<div className="mt-3">{children}</div>
		</div>
	);
}

function Metric({
	label,
	value,
	hint,
}: {
	label: string;
	value: string | number;
	hint?: string;
}) {
	return (
		<div>
			<div className="font-semibold text-2xl">{value}</div>
			<div className="text-muted-foreground text-xs">{label}</div>
			{hint && <div className="text-muted-foreground text-xs">{hint}</div>}
		</div>
	);
}

function Unavailable({ module }: { module: string }) {
	return (
		<p className="text-muted-foreground text-sm">
			Enable <span className="font-medium">{module}</span> to see this.
		</p>
	);
}

export default async function ReportingPage({
	workspaceId,
	settings,
	searchParams,
}: ModulePageProps) {
	const config = reportingAnalyticsSettingsSchema.parse(settings);
	const params = await searchParams;
	const daysRaw = Number(first(params.days));
	const days = (RANGE_PRESETS as readonly number[]).includes(daysRaw)
		? daysRaw
		: 30;
	const granularityRaw = first(params.granularity);
	const granularity: Granularity = (
		GRANULARITIES as readonly string[]
	).includes(granularityRaw ?? "")
		? (granularityRaw as Granularity)
		: "day";
	const now = new Date();
	const report = await getWorkspaceReport(workspaceId, {
		from: new Date(now.getTime() - days * 86_400_000),
		to: now,
		timeZone: config.defaultTimeZone,
		granularity,
	});
	const {
		clients,
		invoices,
		payments,
		revenueSeries,
		orders,
		fulfillment,
		projects,
		bookings,
		contracts,
		inventory,
		traffic,
	} = report;

	return (
		<section className="mt-8 space-y-6">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Last</span>
					{RANGE_PRESETS.map((preset) => (
						<Link
							key={preset}
							href={`?days=${preset}&granularity=${granularity}`}
							className={
								preset === days
									? "font-medium underline"
									: "text-muted-foreground hover:underline"
							}
						>
							{preset === 365 ? "12mo" : `${preset}d`}
						</Link>
					))}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">By</span>
					{GRANULARITIES.map((option) => (
						<Link
							key={option}
							href={`?days=${days}&granularity=${option}`}
							className={
								option === granularity
									? "font-medium underline"
									: "text-muted-foreground hover:underline"
							}
						>
							{option}
						</Link>
					))}
				</div>
				<span className="text-muted-foreground text-xs">
					Times in {config.defaultTimeZone}. Currencies are never combined.
				</span>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<Card title="Clients">
					{clients.available ? (
						<div className="flex gap-8">
							<Metric label="Total" value={clients.data.total} />
							<Metric label="New in range" value={clients.data.newInRange} />
						</div>
					) : (
						<Unavailable module="Client Records" />
					)}
				</Card>

				<Card title="Invoicing">
					{invoices.available ? (
						invoices.data.length === 0 ? (
							<p className="text-muted-foreground text-sm">No invoices yet.</p>
						) : (
							<div className="space-y-3">
								{invoices.data.map((row) => (
									<div key={row.currency} className="space-y-1">
										<div className="font-medium text-xs">{row.currency}</div>
										<div className="flex flex-wrap gap-6">
											<Metric label="Issued" value={row.issued} />
											<Metric label="Paid" value={row.paid} />
											<Metric
												label="Collected"
												value={money(row.paidCents, row.currency)}
											/>
											<Metric
												label="Outstanding"
												value={money(row.outstandingCents, row.currency)}
											/>
										</div>
									</div>
								))}
							</div>
						)
					) : (
						<Unavailable module="Invoicing" />
					)}
				</Card>

				<Card title="Payments">
					{payments.available ? (
						payments.data.length === 0 ? (
							<p className="text-muted-foreground text-sm">No payments yet.</p>
						) : (
							<div className="space-y-3">
								{payments.data.map((row) => (
									<div key={row.currency} className="space-y-1">
										<div className="font-medium text-xs">{row.currency}</div>
										<div className="flex flex-wrap gap-6">
											<Metric
												label={`Collected (${row.collectedCount})`}
												value={money(row.collectedCents, row.currency)}
											/>
											<Metric
												label={`Refunded (${row.refundedCount})`}
												value={money(row.refundedCents, row.currency)}
											/>
										</div>
									</div>
								))}
							</div>
						)
					) : (
						<Unavailable module="Payments" />
					)}
				</Card>

				<Card title="Orders">
					{orders.available ? (
						orders.data.length === 0 ? (
							<p className="text-muted-foreground text-sm">No orders yet.</p>
						) : (
							<div className="space-y-3">
								{orders.data.map((row) => (
									<div key={row.currency} className="space-y-1">
										<div className="font-medium text-xs">{row.currency}</div>
										<div className="flex flex-wrap gap-6">
											<Metric label="Placed" value={row.placed} />
											<Metric label="Fulfilled" value={row.fulfilled} />
											<Metric
												label="Placed value"
												value={money(row.placedCents, row.currency)}
											/>
										</div>
									</div>
								))}
							</div>
						)
					) : (
						<Unavailable module="Orders" />
					)}
				</Card>

				<Card title="Fulfillment">
					{fulfillment.available ? (
						<div className="flex flex-wrap gap-6">
							<Metric label="Pending" value={fulfillment.data.pending} />
							<Metric
								label="Completed"
								value={fulfillment.data.completedInRange}
							/>
							<Metric label="Overdue" value={fulfillment.data.overdue} />
						</div>
					) : (
						<Unavailable module="Fulfillment" />
					)}
				</Card>

				<Card title="Projects">
					{projects.available ? (
						<div className="flex flex-wrap gap-6">
							<Metric label="Active" value={projects.data.active} />
							<Metric
								label="Completed"
								value={projects.data.completedInRange}
							/>
						</div>
					) : (
						<Unavailable module="Projects & Tasks" />
					)}
				</Card>

				<Card title="Bookings">
					{bookings.available ? (
						<div className="flex flex-wrap gap-6">
							<Metric
								label="Scheduled"
								value={bookings.data.scheduledInRange}
							/>
							<Metric
								label="Completed"
								value={bookings.data.completedInRange}
							/>
							<Metric label="No-shows" value={bookings.data.noShowsInRange} />
						</div>
					) : (
						<Unavailable module="Bookings" />
					)}
				</Card>

				<Card title="Contracts">
					{contracts.available ? (
						<div className="flex flex-wrap gap-6">
							<Metric
								label="Awaiting signature"
								value={contracts.data.awaitingSignature}
							/>
							<Metric
								label="Completed"
								value={contracts.data.completedInRange}
							/>
						</div>
					) : (
						<Unavailable module="Contracts & E-sign" />
					)}
				</Card>

				<Card title="Inventory">
					{inventory.available ? (
						<div className="flex flex-wrap gap-6">
							<Metric label="Active items" value={inventory.data.activeItems} />
							<Metric label="Low stock" value={inventory.data.lowStockItems} />
						</div>
					) : (
						<Unavailable module="Inventory" />
					)}
				</Card>

				<Card title="Website traffic">
					<div className="flex flex-wrap gap-6">
						<Metric label="Page views" value={traffic.data.summary.pageViews} />
						<Metric label="Visitors" value={traffic.data.summary.visitors} />
						<Metric label="Sessions" value={traffic.data.summary.sessions} />
					</div>
				</Card>
			</div>

			{revenueSeries.available && revenueSeries.data.collected.length > 0 && (
				<Card title={`Collected revenue by ${granularity}`}>
					<div className="space-y-1 text-sm">
						{revenueSeries.data.collected.map((point) => (
							<div
								key={`${point.bucket}-${point.currency}`}
								className="flex justify-between gap-4"
							>
								<span className="text-muted-foreground">
									{point.bucket.slice(0, 10)}
								</span>
								<span>
									{money(point.amountCents, point.currency)} ({point.count})
								</span>
							</div>
						))}
					</div>
				</Card>
			)}
		</section>
	);
}
