import { listWorkspaceActivity } from "@quickengine/db";

// Turn a canonical "<module>.<entity>.<verb>" event name into something readable,
// e.g. "client_records.record.created" → "Client records · created". Deliberately
// generic so new modules' events render without a per-event mapping.
function humanizeEvent(name: string): string {
	const parts = name.split(".");
	const module = parts[0]?.replace(/_/g, " ") ?? name;
	const verb = parts[parts.length - 1] ?? "";
	const label = module.charAt(0).toUpperCase() + module.slice(1);
	return verb ? `${label} · ${verb}` : label;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

function relativeTime(occurredAt: Date): string {
	const diff = occurredAt.getTime() - Date.now();
	for (const [unit, ms] of UNITS) {
		if (Math.abs(diff) >= ms)
			return RELATIVE.format(Math.round(diff / ms), unit);
	}
	return "just now";
}

// The workspace activity feed: the most recent persisted domain events. A read of the
// audit store the event bus writes to — the "what happened here" view.
export async function WorkspaceActivityFeed({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const rows = await listWorkspaceActivity(workspaceId, 20);

	return (
		<section>
			<h2 className="font-medium text-lg">Recent activity</h2>
			{rows.length === 0 ? (
				<p className="mt-2 text-muted-foreground text-sm">
					No activity yet. Changes to records in this workspace will show up
					here.
				</p>
			) : (
				<div className="mt-4 divide-y divide-foreground/[0.06] rounded-xl border border-foreground/[0.06]">
					{rows.map((row) => (
						<div
							key={row.seq}
							className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
						>
							<span className="text-foreground">{humanizeEvent(row.name)}</span>
							<span className="text-muted-foreground">
								{relativeTime(row.occurredAt)}
							</span>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
