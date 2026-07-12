import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Customers",
	description:
		"QuickEngine customers — the businesses building on our backend.",
	path: "/customers",
});

// PLACEHOLDER — customer stories. Real logos/quotes swap in later.
const CUSTOMERS = [
	{
		company: "Northwind Goods",
		industry: "E-commerce",
		quote:
			"We replaced five subscriptions with one workspace and shipped in a weekend.",
	},
	{
		company: "Studio Kestrel",
		industry: "Agency",
		quote:
			"Client workspaces, billing, and files in one place. Our margins thank us.",
	},
	{
		company: "Mika Reyes",
		industry: "Freelancer",
		quote: "I stopped paying for four tools I barely used. It just works.",
	},
	{
		company: "Loop Labs",
		industry: "SaaS",
		quote:
			"Auth, metering, and webhooks out of the box let us focus on our product.",
	},
	{
		company: "Harbor & Co",
		industry: "Retail",
		quote: "Inventory and payments finally live in the same backend.",
	},
	{
		company: "Cadence",
		industry: "Bookings",
		quote: "Scheduling plus payments, zero glue code.",
	},
];

export default function CustomersPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Customers
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Businesses of every shape, all building on one backend.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{CUSTOMERS.map((customer) => (
							<figure
								key={customer.company}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<blockquote className="flex-1 text-foreground leading-relaxed">
									“{customer.quote}”
								</blockquote>
								<figcaption className="mt-6">
									<p className="text-foreground text-sm">{customer.company}</p>
									<p className="text-muted-foreground text-xs">
										{customer.industry}
									</p>
								</figcaption>
							</figure>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
