import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Partners" };

// PLACEHOLDER — partner program tracks.
const TRACKS = [
	{
		name: "Agencies & studios",
		desc: "Build and run client businesses on QuickEngine. Get isolated workspaces, bulk billing, and priority support.",
	},
	{
		name: "Referral partners",
		desc: "Send us business you can't take on, and earn on every account that sticks.",
	},
	{
		name: "Technology partners",
		desc: "Ship a module or integration into the marketplace and reach every workspace.",
	},
];

export default function PartnersPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter flex flex-col items-center border-border border-b py-32 text-center">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Partner with QuickEngine.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Build on it, build with it, or send us the business you can't take —
						there's a track for you.
					</p>
				</section>

				<section className="page-gutter border-border border-b py-16">
					<div className="grid gap-6 sm:grid-cols-3">
						{TRACKS.map((track) => (
							<div
								key={track.name}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{track.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{track.desc}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="page-gutter flex flex-col items-center py-24 text-center">
					<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						Become a partner.
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground">
						Tell us about your business and we'll find the right fit.
					</p>
					<a
						href="/contact"
						className="mt-8 inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
					>
						Apply now
					</a>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
