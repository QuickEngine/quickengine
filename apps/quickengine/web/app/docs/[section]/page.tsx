import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../../_components/site-footer";
import { SiteHeader } from "../../_components/site-header";

// PLACEHOLDER — light doc pages. Real docs content replaces the blocks later.
const SECTIONS = {
	quickstarts: {
		title: "Quickstarts",
		intro:
			"Go from zero to a running backend in a few minutes. Create a workspace, switch on a module, and make your first call.",
		blocks: [
			{
				heading: "Create a workspace",
				body: "Every project starts with a workspace — a backend scoped to one business type.",
				code: `const qe = new QuickEngine(process.env.QE_API_KEY);\nconst ws = await qe.workspaces.create({ type: "saas" });`,
			},
			{
				heading: "Enable a module",
				body: "Modules are off by default. Switch on what you need.",
				code: `await ws.modules.enable("billing");`,
			},
		],
	},
	api: {
		title: "API reference",
		intro:
			"A single REST API over every module. Authenticate with a bearer token from your workspace settings.",
		blocks: [
			{
				heading: "Authentication",
				body: "Every request carries a bearer token.",
				code: `curl https://api.quickengine.dev/v1/me \\\n  -H "Authorization: Bearer $QE_API_KEY"`,
			},
			{
				heading: "Resources",
				body: "Workspaces, members, and modules — each module adds its own endpoints under the same base.",
				code: "",
			},
		],
	},
	sdks: {
		title: "SDKs",
		intro:
			"Typed client libraries covering every module, for the languages you actually use.",
		blocks: [
			{
				heading: "Install",
				body: "Grab the SDK for your runtime.",
				code: "npm install @quickengine/sdk",
			},
			{
				heading: "Usage",
				body: "One fully-typed client for the whole API.",
				code: `import { QuickEngine } from "@quickengine/sdk";\nconst qe = new QuickEngine(process.env.QE_API_KEY);`,
			},
		],
	},
	cli: {
		title: "CLI",
		intro:
			"Manage workspaces, modules, and deploys without leaving the terminal.",
		blocks: [
			{
				heading: "Install",
				body: "One command, then log in.",
				code: "npm install -g @quickengine/cli\nqe login",
			},
			{
				heading: "Common commands",
				body: "Spin up and manage from your shell.",
				code: "qe workspaces create --type agency\nqe modules enable search",
			},
		],
	},
	examples: {
		title: "Examples",
		intro: "Full, working sample apps you can clone and run in minutes.",
		blocks: [
			{
				heading: "Starter apps",
				body: "Reference implementations for each business type — every one a real repo.",
				code: "",
			},
			{
				heading: "Clone one",
				body: "Pull an example straight from the CLI.",
				code: "qe examples clone ecommerce-store",
			},
		],
	},
} as const;

type Slug = keyof typeof SECTIONS;

export function generateStaticParams() {
	return Object.keys(SECTIONS).map((section) => ({ section }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ section: string }>;
}): Promise<Metadata> {
	const { section } = await params;
	const doc = SECTIONS[section as Slug];
	return doc
		? buildMetadata({
				title: doc.title,
				description: doc.intro,
				path: `/docs/${section}`,
			})
		: buildMetadata({ title: "Documentation", path: "/docs" });
}

export default async function DocSectionPage({
	params,
}: {
	params: Promise<{ section: string }>;
}) {
	const { section } = await params;
	const doc = SECTIONS[section as Slug];
	if (!doc) notFound();

	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter py-24">
					<div className="mx-auto max-w-3xl">
						<a
							href="/docs"
							className="text-muted-foreground text-sm transition-colors hover:text-foreground"
						>
							← Documentation
						</a>
						<h1 className="mt-6 font-display font-normal text-4xl text-foreground tracking-tight sm:text-5xl">
							{doc.title}
						</h1>
						<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
							{doc.intro}
						</p>

						<div className="mt-12 flex flex-col gap-12">
							{doc.blocks.map((block) => (
								<div key={block.heading}>
									<h2 className="font-display text-foreground text-xl">
										{block.heading}
									</h2>
									<p className="mt-3 text-muted-foreground leading-relaxed">
										{block.body}
									</p>
									{block.code ? (
										<pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-secondary/20 p-5 font-mono text-foreground text-sm leading-relaxed">
											<code>{block.code}</code>
										</pre>
									) : null}
								</div>
							))}
						</div>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
