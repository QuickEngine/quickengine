import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Panel, PanelLabel } from "../components/surface";
import { accountQueries, useActiveOrganization } from "../lib/account-api";
import { PLANS } from "../lib/plans";

const formatBytes = (value: number) => {
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)} GB`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)} KB`;
	return `${value} B`;
};
const meters = [
	["storageBytes", "Storage", formatBytes],
	["seats", "Seats", (value: number) => value.toLocaleString()],
	["workspaces", "Workspaces", (value: number) => value.toLocaleString()],
	[
		"apiRequests",
		"API requests this period",
		(value: number) => value.toLocaleString(),
	],
	[
		"aiActions",
		"AI actions this period",
		(value: number) => value.toLocaleString(),
	],
] as const;

function UsagePage() {
	const { active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	if (plan.isPending) return <main className="p-6">Loading usage…</main>;
	if (plan.isError) throw plan.error;
	return (
		<div className="space-y-4 p-6">
			<Panel>
				<PanelLabel>Plan</PanelLabel>
				<p className="mt-2 font-medium">
					{PLANS.find((candidate) => candidate.id === plan.data.planId)?.name ??
						"Free"}
					<span className="ml-2 text-muted-foreground text-sm">
						{active?.name}
					</span>
				</p>
			</Panel>
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{meters.map(([key, label, format]) => {
					const usage = plan.data.usage[key] ?? {
						used: 0,
						limit: null,
						state: "ok",
					};
					const percent =
						usage.limit && usage.limit > 0
							? Math.min(100, Math.round((usage.used / usage.limit) * 100))
							: 0;
					const color =
						usage.state === "over"
							? "bg-rose-400"
							: usage.state === "warn"
								? "bg-amber-400"
								: "bg-emerald-400";
					return (
						<Panel key={key}>
							<PanelLabel>{label}</PanelLabel>
							<div className="mt-2 flex items-baseline justify-between gap-3">
								<span className="font-display text-2xl">
									{format(usage.used)}
								</span>
								<span className="text-muted-foreground text-sm">
									of {usage.limit === null ? "Unlimited" : format(usage.limit)}
								</span>
							</div>
							{usage.limit !== null && (
								<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
									<div
										className={`h-full ${color}`}
										style={{ width: `${percent}%` }}
									/>
								</div>
							)}
						</Panel>
					);
				})}
			</section>
			<p className="text-muted-foreground text-xs">
				Usage is tracked per organization against your plan's allowances.
				Metering expands as AI, communications, and automation features ship.
			</p>
		</div>
	);
}

export const Route = createFileRoute("/usage")({ component: UsagePage });
