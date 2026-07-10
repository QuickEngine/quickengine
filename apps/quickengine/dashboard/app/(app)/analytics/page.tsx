import type { Metadata } from "next";
import { Panel, PanelLabel, StatCard } from "../../_components/surface";

export const metadata: Metadata = { title: "Analytics" };

const stats = [
	{
		label: "Orders",
		value: "1,284",
		delta: { text: "9.3%", dir: "up" as const },
		hint: "this cycle",
		data: [70, 82, 96, 104, 118, 126, 128],
	},
	{
		label: "Visitors",
		value: "42.1K",
		delta: { text: "4.7%", dir: "up" as const },
		hint: "unique",
		data: [30, 33, 35, 38, 39, 41, 42],
	},
	{
		label: "Conversion",
		value: "3.0%",
		delta: { text: "0.4%", dir: "down" as const },
		hint: "visit → order",
		data: [3.4, 3.3, 3.2, 3.1, 3.1, 3.0, 3.0],
	},
	{
		label: "Avg. order",
		value: "$37.60",
		delta: { text: "1.8%", dir: "up" as const },
		hint: "AOV",
		data: [34, 35, 35, 36, 36, 37, 37.6],
	},
];

export default function Page() {
	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{stats.map((s) => (
					<StatCard
						key={s.label}
						label={s.label}
						value={s.value}
						hint={s.hint}
						delta={s.delta}
						data={s.data}
					/>
				))}
			</section>
			<Panel>
				<PanelLabel>Traffic &amp; orders</PanelLabel>
				<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
					Chart coming soon
				</div>
			</Panel>
		</div>
	);
}
