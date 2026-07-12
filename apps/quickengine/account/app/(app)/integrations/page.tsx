import type { Metadata } from "next";
import { Panel } from "../../_components/surface";

export const metadata: Metadata = { title: "Integrations" };

const integrations = [
	{ name: "Stripe", desc: "Payments & billing", connected: true },
	{ name: "Resend", desc: "Transactional email", connected: true },
	{ name: "GitHub", desc: "Attach your storefront repo", connected: false },
	{ name: "Cloudinary", desc: "Media & assets", connected: false },
	{ name: "Algolia", desc: "Search", connected: false },
	{ name: "Sentry", desc: "Error monitoring", connected: false },
];

export default function Page() {
	return (
		<div className="p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{integrations.map((i) => (
					<Panel key={i.name}>
						<div className="flex items-center justify-between">
							<span className="font-medium text-foreground">{i.name}</span>
							<span
								className={`rounded-full px-2 py-0.5 text-[11px] ${i.connected ? "bg-foreground/10 text-foreground" : "border border-foreground/15 text-muted-foreground"}`}
							>
								{i.connected ? "Connected" : "Connect"}
							</span>
						</div>
						<p className="mt-2 text-muted-foreground text-sm">{i.desc}</p>
					</Panel>
				))}
			</section>
		</div>
	);
}
