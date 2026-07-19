import type { Metadata } from "next";
import { Panel, PanelLabel } from "../../_components/surface";

export const metadata: Metadata = { title: "Products" };

// The one QuickEngine product that's live today. Others in the ecosystem are
// named honestly as planned, not dressed up as available.
const QUICKDASH_URL =
	process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL ??
	(process.env.NODE_ENV === "production"
		? "https://dash.quickengine.xyz"
		: "http://localhost:3011");

type Product = {
	name: string;
	desc: string;
	href?: string;
};

const available: Product[] = [
	{
		name: "QuickDash",
		desc: "Your business backend — client records, invoicing, payments, fulfillment, and every module on top.",
		href: QUICKDASH_URL,
	},
];

const planned: Product[] = [
	{
		name: "QuickFlow",
		desc: "Automation, workflows, and AI built on QuickDash's events and actions.",
	},
	{
		name: "QuickTools",
		desc: "A suite of utility widgets and quick tasks that live inside QuickDash.",
	},
];

export default function Page() {
	return (
		<div className="space-y-8 p-6">
			<section>
				<PanelLabel>Your products</PanelLabel>
				<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{available.map((p) => (
						<Panel key={p.name}>
							<div className="flex items-center justify-between gap-3">
								<span className="font-medium text-foreground">{p.name}</span>
								<span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-400">
									Available
								</span>
							</div>
							<p className="mt-2 text-muted-foreground text-sm">{p.desc}</p>
							{p.href && (
								<a
									href={p.href}
									className="mt-4 inline-flex w-fit rounded-lg border border-foreground/15 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-foreground/5"
								>
									Open QuickDash →
								</a>
							)}
						</Panel>
					))}
				</div>
			</section>

			<section>
				<PanelLabel>Coming to the ecosystem</PanelLabel>
				<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{planned.map((p) => (
						<Panel key={p.name}>
							<div className="flex items-center justify-between gap-3">
								<span className="font-medium text-foreground">{p.name}</span>
								<span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground">
									Coming soon
								</span>
							</div>
							<p className="mt-2 text-muted-foreground text-sm">{p.desc}</p>
						</Panel>
					))}
				</div>
			</section>

			<section>
				<PanelLabel>Integrations</PanelLabel>
				<Panel className="mt-3">
					<p className="text-muted-foreground text-sm">
						Connecting external tools — Sign in with QuickEngine, connected
						apps, and storefront webhooks — arrives with the public API and OIDC
						work. There's nothing to connect yet.
					</p>
				</Panel>
			</section>
		</div>
	);
}
