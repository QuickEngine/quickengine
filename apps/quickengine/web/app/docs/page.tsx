import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Documentation",
	description:
		"QuickEngine documentation — quickstarts, API reference, SDKs, and CLI guides to get you shipping fast.",
	path: "/docs",
});

const SECTIONS = [
	{
		name: "Quickstarts",
		desc: "Zero to a running backend in a few minutes.",
		href: "/docs/quickstarts",
	},
	{
		name: "API reference",
		desc: "Every endpoint across every module.",
		href: "/docs/api",
	},
	{
		name: "SDKs",
		desc: "Typed client libraries for your runtime.",
		href: "/docs/sdks",
	},
	{
		name: "CLI",
		desc: "Manage workspaces and modules from the terminal.",
		href: "/docs/cli",
	},
	{
		name: "Examples",
		desc: "Full sample apps you can clone and run.",
		href: "/docs/examples",
	},
	{
		name: "Guides",
		desc: "Step-by-step walkthroughs for common builds.",
		href: "/guides",
	},
];

export default function DocsPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Documentation
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Everything you need to build on QuickEngine — start with a
						quickstart or dive into the reference.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{SECTIONS.map((section) => (
							<a
								key={section.name}
								href={section.href}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{section.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{section.desc}
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
