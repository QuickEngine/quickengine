import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Case Studies",
	description:
		"QuickEngine case studies — how real businesses ship faster on one backend.",
	path: "/case-studies",
});

// PLACEHOLDER case studies.
const STUDIES = [
	{
		company: "Northwind Goods",
		result: "Replaced 5 tools, shipped in a weekend",
		desc: "How an e-commerce shop consolidated its stack onto one backend.",
	},
	{
		company: "Studio Kestrel",
		result: "40% less time on client ops",
		desc: "Per-client workspaces, billing, and files in one place.",
	},
	{
		company: "Loop Labs",
		result: "Launched billing in a day",
		desc: "A SaaS team skipped the metering build with the Billing module.",
	},
];

export default function CaseStudiesPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Case studies
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						How real teams ship faster on one backend.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{STUDIES.map((study) => (
							<div
								key={study.company}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<p className="text-[13px] text-muted-foreground">
									{study.company}
								</p>
								<h2 className="mt-2 font-display text-foreground text-lg">
									{study.result}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{study.desc}
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
