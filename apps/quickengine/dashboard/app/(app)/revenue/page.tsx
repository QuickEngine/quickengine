import type { Metadata } from "next";
import { Panel, PanelLabel, StatCard } from "../../_components/surface";

export const metadata: Metadata = { title: "Revenue" };

// Read-only revenue rollup across every workspace (placeholder data).
const stats = [
	{
		label: "MRR",
		value: "$4,820",
		delta: { text: "6.2%", dir: "up" as const },
		hint: "monthly recurring",
		data: [3.1, 3.4, 3.6, 4, 4.2, 4.6, 4.8],
	},
	{
		label: "Total revenue",
		value: "$48,250",
		delta: { text: "12.4%", dir: "up" as const },
		hint: "all time",
		data: [18, 22, 27, 31, 38, 43, 48],
	},
	{
		label: "Net payouts",
		value: "$41,300",
		hint: "after fees",
		data: [16, 19, 24, 28, 33, 38, 41],
	},
	{
		label: "Refunds",
		value: "$620",
		delta: { text: "2.1%", dir: "down" as const },
		hint: "this cycle",
		data: [9, 8, 8, 7, 7, 6, 6],
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
				<PanelLabel>Revenue over time</PanelLabel>
				<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
					Chart coming soon
				</div>
			</Panel>
		</div>
	);
}
