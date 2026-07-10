import type { Metadata } from "next";
import { Panel, PanelLabel, StatCard } from "../../_components/surface";

export const metadata: Metadata = { title: "Team" };

const members = [
	{ name: "You", role: "Owner" },
	{ name: "Pending invite", role: "Member" },
];

export default function Page() {
	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard label="Members" value="1" hint="across the account" />
				<StatCard label="Seats" value="1 / 1" hint="on your plan" />
				<StatCard label="Pending invites" value="0" hint="awaiting response" />
			</section>
			<Panel>
				<PanelLabel>Members</PanelLabel>
				<div className="mt-3 divide-y divide-foreground/[0.06]">
					{members.map((m) => (
						<div
							key={m.name}
							className="flex items-center justify-between py-3 text-sm"
						>
							<span className="text-foreground">{m.name}</span>
							<span className="text-muted-foreground">{m.role}</span>
						</div>
					))}
				</div>
			</Panel>
		</div>
	);
}
