import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Startup Program" };

// PLACEHOLDER — program perks and eligibility are provisional.
const PERKS = [
	{
		title: "Discounted plans",
		desc: "Deep discounts on paid tiers for your first year, so backend cost isn't a blocker.",
	},
	{
		title: "Priority support",
		desc: "A faster line to the team while you're finding product-market fit.",
	},
	{
		title: "Onboarding help",
		desc: "Hands-on help shaping your workspace and wiring up the modules you need.",
	},
];

export default function StartupProgramPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						The QuickEngine Startup Program.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Early-stage startups get discounted plans, priority support, and
						onboarding help — so you can put your idea in front of users this
						week, not this quarter.
					</p>
					<div className="mt-10">
						<a
							href="/contact"
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Apply now
						</a>
					</div>
				</section>

				<section className="page-gutter border-border border-b py-24">
					<div className="grid gap-6 sm:grid-cols-3">
						{PERKS.map((perk) => (
							<div
								key={perk.title}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{perk.title}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{perk.desc}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="page-gutter py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Who qualifies
					</h2>
					<p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
						Pre-seed and seed-stage companies, typically under three years old
						and not previously on a paid QuickEngine plan. Tell us about your
						startup and we'll take it from there.
					</p>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
