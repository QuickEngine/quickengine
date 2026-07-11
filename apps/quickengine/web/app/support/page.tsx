import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Support" };

// PLACEHOLDER — a help-center entry. Topics link into /docs sections.
const TOPICS = [
	{
		title: "Getting started",
		desc: "Create an account, spin up your first workspace.",
	},
	{
		title: "Account & billing",
		desc: "Plans, invoices, seats, and payment methods.",
	},
	{
		title: "Modules",
		desc: "Auth, billing, storage, search, jobs, realtime, and more.",
	},
	{
		title: "API & SDKs",
		desc: "Endpoints, keys, rate limits, and client libraries.",
	},
	{
		title: "Workspaces",
		desc: "Business types, limits, members, and data export.",
	},
	{
		title: "Troubleshooting",
		desc: "Common errors and how to resolve them.",
	},
];

export default function SupportPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter flex flex-col items-center border-border border-b py-24 text-center">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						How can we help?
					</h1>
					<form
						action="/docs"
						className="mt-10 flex w-full max-w-xl items-center gap-2 rounded-full border border-border bg-secondary/20 p-2 focus-within:border-foreground/30"
					>
						<input
							type="search"
							name="q"
							placeholder="Search the docs…"
							aria-label="Search the docs"
							className="flex-1 bg-transparent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
						/>
						<button
							type="submit"
							className="inline-flex h-9 items-center rounded-full bg-foreground px-5 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Search
						</button>
					</form>
				</section>

				<section className="page-gutter border-border border-b py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{TOPICS.map((topic) => (
							<a
								key={topic.title}
								href="/docs"
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{topic.title}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{topic.desc}
								</p>
							</a>
						))}
					</div>
				</section>

				<section className="page-gutter flex flex-col items-center py-16 text-center">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Still stuck?
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground">
						Reach the team directly, or ask the community.
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<a
							href="/contact"
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Contact support
						</a>
						<a
							href="/community"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							Ask the community
						</a>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
