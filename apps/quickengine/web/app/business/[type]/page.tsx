import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../../_components/site-footer";
import { SiteHeader } from "../../_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

// PLACEHOLDER — business-type solution pages. Copy is provisional.
const SOLUTIONS = {
	ecommerce: {
		name: "E-commerce",
		headline: "The backend behind your storefront.",
		sub: "Orders, inventory, payments, and search — one backend that already speaks retail.",
		modules: ["Auth", "Billing", "Storage", "Search", "Inventory", "Webhooks"],
		useCases: [
			"Product catalog + inventory",
			"Checkout and subscriptions",
			"Order + fulfillment tracking",
			"Customer accounts",
		],
		contactSales: false,
	},
	agencies: {
		name: "Agencies",
		headline: "Every client, their own workspace.",
		sub: "Isolated, billable client workspaces with projects, files, and invoicing built in.",
		modules: ["Auth", "Projects", "Files", "Invoicing", "Billing"],
		useCases: [
			"Per-client workspaces",
			"Project + task tracking",
			"File delivery + approvals",
			"Retainer + invoice billing",
		],
		contactSales: false,
	},
	freelancers: {
		name: "Freelancers",
		headline: "Run your whole practice on one backend.",
		sub: "Contacts, invoices, and files without a stack of subscriptions eating your margin.",
		modules: ["Auth", "Invoicing", "Files", "Contacts"],
		useCases: [
			"Client + contact records",
			"Invoices + payments",
			"File sharing",
			"Simple scheduling",
		],
		contactSales: false,
	},
	saas: {
		name: "SaaS",
		headline: "Skip the plumbing every app reinvents.",
		sub: "Auth, metering, webhooks, and analytics out of the box, so you ship your product.",
		modules: ["Auth", "Billing", "Analytics", "Webhooks", "Jobs"],
		useCases: [
			"User auth + orgs",
			"Usage-based billing",
			"Event webhooks",
			"Product analytics",
		],
		contactSales: false,
	},
	enterprise: {
		name: "Enterprise",
		headline: "One backend, at your scale and standards.",
		sub: "SSO, custom limits, an SLA, and a dedicated team — with your data staying yours.",
		modules: [
			"SSO / SAML",
			"SCIM",
			"Audit logs",
			"Custom limits",
			"Dedicated support",
		],
		useCases: [
			"SSO + user provisioning",
			"Security + compliance review",
			"Custom SLAs",
			"Guided migration",
		],
		contactSales: true,
	},
	startups: {
		name: "Startups",
		headline: "Ship your MVP on day one.",
		sub: "Skip the backend build. Auth, billing, and storage are ready, so you can put your idea in front of users this week.",
		modules: ["Auth", "Billing", "Storage", "Search", "Analytics"],
		useCases: [
			"Stand up an MVP fast",
			"Usage-based billing from day one",
			"Iterate without re-architecting",
			"Keep your burn low",
		],
		contactSales: false,
	},
	"scale-ups": {
		name: "Scale-ups",
		headline: "Grow without re-platforming.",
		sub: "The same backend from your first user to your millionth — add modules and workspaces as you grow, no rewrites.",
		modules: ["Auth", "Billing", "Jobs", "Realtime", "Webhooks", "Analytics"],
		useCases: [
			"Add capacity without migrations",
			"Multiple products, one backend",
			"Reliable background work",
			"Real-time features",
		],
		contactSales: false,
	},
	migrations: {
		name: "Migrations",
		headline: "Move your stack over, painlessly.",
		sub: "Bring auth, billing, storage, and data across from a patchwork of tools — with import paths and guided help.",
		modules: ["Auth", "Billing", "Storage", "Search", "Webhooks"],
		useCases: [
			"Import users and data",
			"Map existing subscriptions",
			"Run in parallel during cutover",
			"Export anytime — no lock-in",
		],
		contactSales: true,
	},
} as const;

type Slug = keyof typeof SOLUTIONS;

export function generateStaticParams() {
	return Object.keys(SOLUTIONS).map((type) => ({ type }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ type: string }>;
}): Promise<Metadata> {
	const { type } = await params;
	const solution = SOLUTIONS[type as Slug];
	return solution
		? buildMetadata({
				title: solution.name,
				description: solution.sub,
				path: `/business/${type}`,
			})
		: buildMetadata({ title: "Business", path: "/business" });
}

export default async function BusinessSolutionPage({
	params,
}: {
	params: Promise<{ type: string }>;
}) {
	const { type } = await params;
	const solution = SOLUTIONS[type as Slug];
	if (!solution) notFound();

	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				{/* Hero */}
				<section className="page-gutter border-border border-b py-32">
					<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
						For {solution.name}
					</p>
					<h1 className="mt-6 max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						{solution.headline}
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						{solution.sub}
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<a
							href={solution.contactSales ? "/contact" : `${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							{solution.contactSales ? "Contact sales" : "Get Started"}
						</a>
						<a
							href="/pricing"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							View pricing
						</a>
					</div>
				</section>

				{/* Included modules */}
				<section className="page-gutter border-border border-b py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						What's included
					</h2>
					<div className="mt-8 flex flex-wrap gap-3">
						{solution.modules.map((module) => (
							<span
								key={module}
								className="rounded-full border border-border px-4 py-2 text-foreground text-sm"
							>
								{module}
							</span>
						))}
					</div>
				</section>

				{/* Common builds */}
				<section className="page-gutter py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Common builds
					</h2>
					<ul className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
						{solution.useCases.map((useCase) => (
							<li
								key={useCase}
								className="flex items-start gap-2 text-muted-foreground"
							>
								<span className="text-foreground">—</span>
								{useCase}
							</li>
						))}
					</ul>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
