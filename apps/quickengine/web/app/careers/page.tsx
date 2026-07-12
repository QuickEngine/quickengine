import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Careers",
	description:
		"Careers at QuickEngine — help build the backend the next generation of businesses runs on.",
	path: "/careers",
});

// PLACEHOLDER roles.
const ROLES = [
	{
		title: "Founding Engineer",
		meta: "Full-time · Remote",
		desc: "Own whole slices of the platform, from the API down to the UI.",
	},
	{
		title: "Developer Advocate",
		meta: "Full-time · Remote",
		desc: "Docs, examples, and community — help developers succeed on QuickEngine.",
	},
	{
		title: "Growth Marketer",
		meta: "Full-time · Remote",
		desc: "Own the funnel from first touch to an activated workspace.",
	},
];

export default function CareersPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Work with us.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						We're a small team building in the open. High ownership, low
						process, and a product people actually want.
					</p>
				</section>

				<section className="page-gutter border-border border-b py-16">
					<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
						Open roles
					</h2>
					<div className="mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
						{ROLES.map((role) => (
							<a
								key={role.title}
								href="/contact"
								className="flex flex-col gap-1 px-6 py-5 transition-colors hover:bg-foreground/5 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p className="font-display text-foreground text-lg">
										{role.title}
									</p>
									<p className="mt-1 text-muted-foreground text-sm">
										{role.desc}
									</p>
								</div>
								<span className="text-muted-foreground text-sm sm:shrink-0">
									{role.meta}
								</span>
							</a>
						))}
					</div>
				</section>

				<section className="page-gutter flex flex-col items-center py-24 text-center">
					<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						Don't see your role?
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground">
						We're always happy to talk to great people. Reach out.
					</p>
					<a
						href="/contact"
						className="mt-8 inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
					>
						Get in touch
					</a>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
