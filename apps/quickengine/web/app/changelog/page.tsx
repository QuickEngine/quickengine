import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Changelog",
	description:
		"QuickEngine changelog — the latest features, improvements, and fixes.",
	path: "/changelog",
});

// PLACEHOLDER release notes.
const RELEASES = [
	{
		version: "0.4.0",
		date: "July 2026",
		notes: [
			"QuickDash workspace recipes for e-commerce, agencies, and SaaS.",
			"New Search module with typo tolerance.",
			"Faster cold starts across all regions.",
		],
	},
	{
		version: "0.3.0",
		date: "June 2026",
		notes: [
			"Realtime module out of beta.",
			"Usage-based billing and metering.",
			"CLI v2 with workspace management.",
		],
	},
	{
		version: "0.2.0",
		date: "June 2026",
		notes: [
			"Passkeys and two-factor authentication.",
			"Webhooks module with reliable delivery.",
			"Dashboard revamp.",
		],
	},
	{
		version: "0.1.0",
		date: "May 2026",
		notes: ["First public preview."],
	},
];

export default function ChangelogPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Changelog
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						What's new in QuickEngine. Shipping in the open.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="mx-auto flex max-w-3xl flex-col gap-12">
						{RELEASES.map((release) => (
							<div
								key={release.version}
								className="flex flex-col gap-4 border-border border-b pb-12 last:border-b-0 sm:flex-row sm:gap-12"
							>
								<div className="sm:w-40 sm:shrink-0">
									<p className="font-display text-foreground text-lg">
										v{release.version}
									</p>
									<p className="text-muted-foreground text-sm">
										{release.date}
									</p>
								</div>
								<ul className="flex flex-1 flex-col gap-2">
									{release.notes.map((note) => (
										<li
											key={note}
											className="flex items-start gap-2 text-muted-foreground"
										>
											<span className="text-foreground">—</span>
											{note}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
