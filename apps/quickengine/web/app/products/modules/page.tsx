import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../../_components/site-footer";
import { SiteHeader } from "../../_components/site-header";
import { MODULES } from "./_modules";

export const metadata = buildMetadata({
	title: "Modules",
	description:
		"QuickEngine modules — switch on auth, billing, storage, search, and more, each a building block of your backend.",
	path: "/products/modules",
});

export default function ModulesPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Everything, already built.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Every module you'd otherwise wire up yourself. Switch them on per
						workspace — off by default, production-grade when you need them.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{MODULES.map((module) => (
							<a
								key={module.slug}
								href={`/products/modules/${module.slug}`}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{module.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{module.tagline}
								</p>
							</a>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
