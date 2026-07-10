import { Panel, PanelLabel, StatCard } from "./_components/surface";

// Placeholder rollups — the umbrella view across every workspace (read-only).
// Real aggregates (and real series) wire in once workspaces + billing connect.
const stats = [
	{
		label: "Total revenue",
		value: "$48,250",
		delta: { text: "12.4%", dir: "up" as const },
		hint: "vs last cycle",
		data: [18, 22, 20, 27, 25, 33, 41],
	},
	{
		label: "Active workspaces",
		value: "3",
		delta: { text: "1", dir: "up" as const },
		hint: "of 5 on your plan",
		data: [1, 1, 2, 2, 2, 3, 3],
	},
	{
		label: "Actions this cycle",
		value: "128.4K",
		delta: { text: "8.1%", dir: "up" as const },
		hint: "64% of 200K",
		data: [70, 82, 96, 90, 108, 120, 128],
	},
	{
		label: "Seats used",
		value: "7",
		delta: { text: "1", dir: "down" as const },
		hint: "2 pending invites",
		data: [9, 9, 8, 8, 7, 7, 7],
	},
];

export default function Page() {
	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{stats.map(({ label, value, hint, delta, data }) => (
					<StatCard
						key={label}
						label={label}
						value={value}
						hint={hint}
						delta={delta}
						data={data}
					/>
				))}
			</section>

			<section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<Panel className="lg:col-span-2">
					<PanelLabel>Revenue across workspaces</PanelLabel>
					<div className="flex h-56 items-center justify-center text-muted-foreground text-sm">
						Chart coming soon
					</div>
				</Panel>
				<Panel>
					<PanelLabel>Recent activity</PanelLabel>
					<div className="flex h-56 items-center justify-center text-muted-foreground text-sm">
						Nothing yet
					</div>
				</Panel>
			</section>
		</div>
	);
}
