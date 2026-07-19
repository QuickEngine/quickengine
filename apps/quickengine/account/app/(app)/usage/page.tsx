import { getSession } from "@quickengine/auth/server";
import { getAccountPlanId, getPlan, getUsage } from "@quickengine/billing";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Panel, PanelLabel } from "../../_components/surface";
import { resolveActiveOrg } from "../../_lib/active-org";

export const metadata: Metadata = { title: "Usage" };

function formatBytes(n: number): string {
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
	return `${n} B`;
}

const count = (n: number) => n.toLocaleString();

// Meters shown, in order, with a friendly label + value formatter.
const METERS: {
	key: "storageBytes" | "seats" | "workspaces" | "actions";
	label: string;
	format: (n: number) => string;
}[] = [
	{ key: "storageBytes", label: "Storage", format: formatBytes },
	{ key: "seats", label: "Seats", format: count },
	{ key: "workspaces", label: "Workspaces", format: count },
	{ key: "actions", label: "Actions this period", format: count },
];

// Usage is org-scoped: it reads the metering engine against the active org's plan allowances.
export default async function Page() {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;

	const [usage, planId] = await Promise.all([
		getUsage({ scopeId: org.id }),
		getAccountPlanId(org.id),
	]);
	const planName = getPlan(planId)?.displayName ?? "Free";

	return (
		<div className="space-y-4 p-6">
			<Panel>
				<PanelLabel>Plan</PanelLabel>
				<p className="mt-2 font-medium text-foreground">
					{planName}
					<span className="ml-2 text-muted-foreground text-sm">{org.name}</span>
				</p>
			</Panel>

			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{METERS.map(({ key, label, format }) => {
					const check = usage[key];
					const used = format(check.used);
					const limit =
						check.limit === null ? "Unlimited" : format(check.limit);
					const pct =
						check.limit && check.limit > 0
							? Math.min(100, Math.round((check.used / check.limit) * 100))
							: 0;
					const barColor =
						check.state === "over"
							? "bg-rose-400"
							: check.state === "warn"
								? "bg-amber-400"
								: "bg-emerald-400";
					return (
						<Panel key={key}>
							<PanelLabel>{label}</PanelLabel>
							<div className="mt-2 flex items-baseline justify-between gap-3">
								<span className="font-display text-2xl text-foreground">
									{used}
								</span>
								<span className="text-muted-foreground text-sm">
									of {limit}
								</span>
							</div>
							{check.limit !== null && (
								<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
									<div
										className={`h-full ${barColor}`}
										style={{ width: `${pct}%` }}
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
