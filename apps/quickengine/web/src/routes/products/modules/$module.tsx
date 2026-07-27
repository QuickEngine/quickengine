import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getModule, MODULES } from "@/lib/modules";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export function generateStaticParams() {
	return MODULES.map((module) => ({ module: module.slug }));
}

function ModulePage() {
	const { module } = Route.useParams();
	const def = getModule(module);
	// `notFound()` throws, but its return type does not tell TypeScript so.
	if (!def) throw notFound();

	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<a
						href="/products/modules"
						className="text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						← Modules
					</a>
					<p className="mt-6 text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
						{def.tagline}
					</p>
					<h1 className="mt-3 max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						{def.name}
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						{def.description}
					</p>
					<div className="mt-10">
						<a
							href={`${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Get Started
						</a>
					</div>

					{def.code ? (
						<pre className="mt-12 max-w-2xl overflow-x-auto rounded-xl border border-border bg-secondary/20 p-5 font-mono text-foreground text-sm leading-relaxed">
							<code>{def.code}</code>
						</pre>
					) : null}
				</section>

				<section className="page-gutter py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						What it does
					</h2>
					<ul className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
						{def.capabilities.map((capability) => (
							<li
								key={capability}
								className="flex items-start gap-2 text-muted-foreground"
							>
								<span className="text-foreground">—</span>
								{capability}
							</li>
						))}
					</ul>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}

export const Route = createFileRoute("/products/modules/$module")({
	component: ModulePage,
});
