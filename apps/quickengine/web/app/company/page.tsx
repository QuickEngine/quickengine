import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Company" };

// Directory for the company section — mirrors the footer's Company column.
const PAGES = [
	{
		name: "About",
		desc: "Who we are, why we're building this, and what we believe.",
		href: "/about",
	},
	{
		name: "Careers",
		desc: "Open roles and how we work.",
		href: "/careers",
	},
	{
		name: "Contact",
		desc: "Reach sales, support, or press.",
		href: "/contact",
	},
	{
		name: "Brand",
		desc: "Logos, colors, and type.",
		href: "/brand",
	},
];

export default function CompanyPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter flex flex-col items-center border-border border-b py-32 text-center">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Company
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						The team building QuickEngine, and everything about us in one place.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2">
						{PAGES.map((page) => (
							<a
								key={page.name}
								href={page.href}
								className="flex flex-col rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
							>
								<h2 className="font-display text-foreground text-lg">
									{page.name}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{page.desc}
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
