import type { Metadata } from "next";
import { Panel, PanelLabel } from "../../_components/surface";

export const metadata: Metadata = { title: "Activity" };

const events = [
	{ text: "Workspace created", when: "just now" },
	{ text: "Signed in from a new device", when: "2h ago" },
	{ text: "Email verified", when: "2h ago" },
	{ text: "Account created", when: "2h ago" },
];

export default function Page() {
	return (
		<div className="p-6">
			<Panel>
				<PanelLabel>Recent activity</PanelLabel>
				<div className="mt-3 divide-y divide-foreground/[0.06]">
					{events.map((e) => (
						<div
							key={e.text}
							className="flex items-center justify-between py-3 text-sm"
						>
							<span className="text-foreground">{e.text}</span>
							<span className="text-muted-foreground">{e.when}</span>
						</div>
					))}
				</div>
			</Panel>
		</div>
	);
}
