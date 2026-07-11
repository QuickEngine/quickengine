import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export const metadata: Metadata = { title: "Developers" };

const BUILD = [
	{ name: "Documentation", desc: "Everything, end to end.", href: "/docs" },
	{
		name: "API reference",
		desc: "One REST API over every module.",
		href: "/docs/api",
	},
	{ name: "SDKs", desc: "Typed clients for your stack.", href: "/docs/sdks" },
	{ name: "CLI", desc: "Manage it all from the terminal.", href: "/docs/cli" },
];

const SNIPPET = `import { QuickEngine } from "@quickengine/sdk";

const qe = new QuickEngine(process.env.QE_API_KEY);

// Spin up a backend shaped for the business type.
const workspace = await qe.workspaces.create({ type: "saas" });
await workspace.modules.enable("billing");`;

export default function DevelopersPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				{/* Hero */}
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Build on QuickEngine.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						One clean REST API over every module, typed SDKs, and a CLI. Point
						any frontend at it and ship.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<a
							href="/docs"
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Read the docs
						</a>
						<a
							href={`${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							Get an API key
						</a>
					</div>

					<pre className="mt-12 max-w-2xl overflow-x-auto rounded-xl border border-border bg-secondary/20 p-5 font-mono text-foreground text-sm leading-relaxed">
						<code>{SNIPPET}</code>
					</pre>
				</section>

				{/* Build */}
				<section className="page-gutter border-border border-b py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Build
					</h2>
					<div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						{BUILD.map((item) => (
							<a
								key={item.name}
								href={item.href}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h3 className="font-display text-foreground text-lg">
									{item.name}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{item.desc}
								</p>
							</a>
						))}
					</div>
				</section>

				{/* Community */}
				<section className="page-gutter flex flex-col items-center py-24 text-center">
					<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						Build in the open with us.
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground">
						Follow development, file issues, and get help from the team.
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<a
							href="https://github.com/QuickEngine"
							target="_blank"
							rel="noreferrer noopener"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							GitHub
						</a>
						<a
							href="/community"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							Discord
						</a>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
