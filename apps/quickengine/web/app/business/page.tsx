import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export const metadata = buildMetadata({
	title: "Business",
	description:
		"QuickEngine for your business type — tailored solutions for e-commerce, agencies, freelancers, SaaS, and more.",
	path: "/business",
});

// PLACEHOLDER — the business-type directory. Cards link to /business/<slug>.
const TYPES = [
	{
		slug: "ecommerce",
		name: "E-commerce",
		tagline: "Storefronts, inventory, orders, and payments.",
	},
	{
		slug: "agencies",
		name: "Agencies",
		tagline: "Isolated, billable client workspaces.",
	},
	{
		slug: "freelancers",
		name: "Freelancers",
		tagline: "Contacts, invoices, and files in one place.",
	},
	{
		slug: "saas",
		name: "SaaS",
		tagline: "Auth, metering, webhooks, and analytics.",
	},
	{
		slug: "enterprise",
		name: "Enterprise",
		tagline: "SSO, custom limits, an SLA, your data.",
	},
];

export default function BusinessPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter flex flex-col items-center border-border border-b py-32 text-center">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Built for how your business works.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Whatever you run, there's a workspace recipe shaped for it — with
						the right modules already on.
					</p>
				</section>

				<section className="page-gutter border-border border-b py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{TYPES.map((type) => (
							<a
								key={type.slug}
								href={`/business/${type.slug}`}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{type.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{type.tagline}
								</p>
							</a>
						))}
						<a
							href="/partners"
							className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
						>
							<h2 className="font-display text-foreground text-lg">Partners</h2>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								Build on QuickEngine or refer clients to it.
							</p>
						</a>
					</div>
				</section>

				<section className="page-gutter flex flex-col items-center py-24 text-center">
					<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						Not sure which fits?
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground">
						Describe your business and let QuickDash assemble the right backend.
					</p>
					<a
						href={`${AUTH_URL}/signup`}
						className="mt-8 inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
					>
						Get Started
					</a>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
