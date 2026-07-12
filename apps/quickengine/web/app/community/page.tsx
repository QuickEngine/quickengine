import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Community",
	description:
		"The QuickEngine community — connect with other builders running their business on QuickEngine.",
	path: "/community",
});

// PLACEHOLDER — ways to plug into the community. Real links/counts swap in later.
const CHANNELS = [
	{
		name: "Discord",
		desc: "Chat with the team and other builders, get help, share what you're building.",
		cta: "Join the server",
		href: "https://discord.gg/quickengine",
	},
	{
		name: "GitHub",
		desc: "Follow development, file issues, and contribute to the open pieces.",
		cta: "Star on GitHub",
		href: "https://github.com/QuickEngine",
	},
	{
		name: "X",
		desc: "Product updates, launches, and the occasional build-in-public thread.",
		cta: "Follow along",
		href: "https://x.com/QuickEngineSW",
	},
];

const STATS = [
	{ value: "1,200+", label: "Builders" },
	{ value: "300+", label: "Discord members" },
	{ value: "Weekly", label: "Office hours" },
];

export default function CommunityPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter flex flex-col items-center border-border border-b py-24 text-center">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Join the community.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Build alongside other founders and developers using QuickEngine.
					</p>

					<div className="mt-12 grid w-full max-w-2xl grid-cols-3 gap-8">
						{STATS.map((stat) => (
							<div key={stat.label}>
								<p className="font-display text-3xl text-foreground">
									{stat.value}
								</p>
								<p className="mt-1 text-muted-foreground text-sm">
									{stat.label}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-3">
						{CHANNELS.map((channel) => (
							<div
								key={channel.name}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{channel.name}
								</h2>
								<p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">
									{channel.desc}
								</p>
								<a
									href={channel.href}
									target="_blank"
									rel="noreferrer noopener"
									className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-border px-5 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
								>
									{channel.cta}
								</a>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
