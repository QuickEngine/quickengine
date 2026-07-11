import { Logo } from "@quickengine/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Brand" };

// PLACEHOLDER — brand assets + basic guidelines. Download links are stubs.
const COLORS = [
	{ name: "Void Black", value: "bg-background", note: "Background" },
	{ name: "Foreground", value: "bg-foreground", note: "Text / marks" },
	{ name: "Muted", value: "bg-muted", note: "Secondary surfaces" },
	{ name: "Border", value: "bg-border", note: "Hairlines" },
];

export default function BrandPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Brand.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Logos, colors, and type. Use them to represent QuickEngine — don't
						alter, recolor, or stretch the mark.
					</p>
				</section>

				{/* Logo */}
				<section className="page-gutter border-border border-b py-16">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Logo
					</h2>
					<div className="mt-8 flex flex-wrap items-center gap-6">
						<div className="flex size-40 items-center justify-center rounded-xl border border-border bg-secondary/20">
							<Logo className="size-16 text-foreground" />
						</div>
						<div className="flex flex-col gap-3">
							<button
								type="button"
								className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
							>
								Download SVG
							</button>
							<button
								type="button"
								className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
							>
								Download PNG
							</button>
						</div>
					</div>
				</section>

				{/* Colors */}
				<section className="page-gutter border-border border-b py-16">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Colors
					</h2>
					<div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						{COLORS.map((color) => (
							<div key={color.name}>
								<div
									className={`h-24 rounded-xl border border-border ${color.value}`}
								/>
								<p className="mt-3 text-foreground text-sm">{color.name}</p>
								<p className="text-muted-foreground text-xs">{color.note}</p>
							</div>
						))}
					</div>
				</section>

				{/* Typography */}
				<section className="page-gutter py-16">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Typography
					</h2>
					<div className="mt-8 grid gap-10 sm:grid-cols-2">
						<div>
							<p className="font-display text-5xl text-foreground">Aa</p>
							<p className="mt-4 text-foreground text-sm">Clash Grotesk</p>
							<p className="text-muted-foreground text-xs">
								Display · headlines
							</p>
						</div>
						<div>
							<p className="text-5xl text-foreground">Aa</p>
							<p className="mt-4 text-foreground text-sm">General Sans</p>
							<p className="text-muted-foreground text-xs">Body · UI</p>
						</div>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
