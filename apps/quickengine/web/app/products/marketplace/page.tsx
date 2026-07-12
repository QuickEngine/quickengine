import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../../_components/site-footer";
import { SiteHeader } from "../../_components/site-header";

export const metadata = buildMetadata({
	title: "Marketplace",
	description:
		"The QuickEngine marketplace — discover modules and integrations that extend your backend.",
	path: "/products/marketplace",
});

// PLACEHOLDER — marketplace listings.
const ITEMS = [
	{
		name: "Shopify sync",
		category: "Integration",
		desc: "Keep products and orders in sync with a Shopify store.",
	},
	{
		name: "QuickBooks",
		category: "Integration",
		desc: "Push invoices and payments into your accounting.",
	},
	{
		name: "Slack",
		category: "Integration",
		desc: "Send workspace events to a Slack channel.",
	},
	{
		name: "Zapier",
		category: "Integration",
		desc: "Connect QuickDash to thousands of apps.",
	},
	{
		name: "Invoicing",
		category: "Module",
		desc: "Estimates, invoices, and payments for service businesses.",
	},
	{
		name: "Scheduling",
		category: "Module",
		desc: "Bookings and appointments with reminders.",
	},
	{
		name: "E-commerce starter",
		category: "Template",
		desc: "A ready-made storefront workspace to fork.",
	},
	{
		name: "Agency starter",
		category: "Template",
		desc: "Client workspaces, projects, and invoicing, preconfigured.",
	},
];

export default function MarketplacePage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Marketplace
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Extend QuickDash with integrations, extra modules, and ready-made
						workspace templates.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{ITEMS.map((item) => (
							<div
								key={item.name}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<span className="text-[11px] text-muted-foreground uppercase tracking-wider">
									{item.category}
								</span>
								<h2 className="mt-2 font-display text-foreground text-lg">
									{item.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{item.desc}
								</p>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
