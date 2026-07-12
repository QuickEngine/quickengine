import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Guides",
	description:
		"QuickEngine guides — practical walkthroughs for getting the most out of your backend.",
	path: "/guides",
});

// PLACEHOLDER — a guide library. Each links to /guides/<slug>.
const GUIDES = [
	{
		title: "Set up authentication",
		desc: "Add sessions, passkeys, and 2FA to your workspace.",
		time: "5 min",
	},
	{
		title: "Take your first payment",
		desc: "Wire up Billing and run a checkout end to end.",
		time: "8 min",
	},
	{
		title: "Store and serve files",
		desc: "Upload, access-control, and serve media from Storage.",
		time: "6 min",
	},
	{
		title: "Add instant search",
		desc: "Index your data and query it with typo tolerance.",
		time: "7 min",
	},
	{
		title: "Run background jobs",
		desc: "Schedule and process work with the Jobs module.",
		time: "6 min",
	},
	{
		title: "Go realtime",
		desc: "Add live presence and updates over one connection.",
		time: "5 min",
	},
];

export default function GuidesPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Guides
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Step-by-step walkthroughs for the most common builds.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{GUIDES.map((guide) => (
							<div
								key={guide.title}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{guide.title}
								</h2>
								<p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">
									{guide.desc}
								</p>
								<span className="mt-4 text-muted-foreground text-xs">
									{guide.time} read
								</span>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
