import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";
import { MODULES } from "./modules/_modules";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export const metadata = buildMetadata({
	title: "Products",
	description:
		"Everything QuickEngine gives your business: workspaces, modules, and a marketplace — one backend for your whole operation.",
	path: "/products",
});

const PLATFORM = [
	{
		name: "Workspaces",
		desc: "One backend, shaped to your business type.",
		href: "/products/workspaces",
	},
	{
		name: "Modules",
		desc: "Auth, billing, storage, and more — switch on what you need.",
		href: "/products/modules",
	},
	{
		name: "Marketplace",
		desc: "Extend with integrations and templates.",
		href: "/products/marketplace",
	},
];

export default function ProductsPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
						QuickDash
					</p>
					<h1 className="mt-6 max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						The modular business backend.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						One backend you own, configured per workspace, with every module
						already built. Bring your own frontend and ship.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<a
							href={`${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Get Started
						</a>
						<a
							href="/pricing"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							View pricing
						</a>
					</div>
				</section>

				<section className="page-gutter border-border border-b py-24">
					<div className="grid gap-6 sm:grid-cols-3">
						{PLATFORM.map((item) => (
							<a
								key={item.name}
								href={item.href}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{item.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{item.desc}
								</p>
							</a>
						))}
					</div>
				</section>

				<section className="page-gutter py-24">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Every module, in one place.
					</h2>
					<div className="mt-8 flex flex-wrap gap-3">
						{MODULES.map((module) => (
							<a
								key={module.slug}
								href={`/products/modules/${module.slug}`}
								className="rounded-full border border-border px-4 py-2 text-foreground text-sm transition-colors hover:bg-foreground/5"
							>
								{module.name}
							</a>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
