import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export const metadata = buildMetadata({
	title: "About",
	description:
		"The team and mission behind QuickEngine — the headless business backend that lets you build more and switch less.",
	path: "/about",
});

// PLACEHOLDER — all copy on this page is provisional.
const VALUES = [
	{
		title: "Build more, switch less.",
		desc: "One backend for every part of your business, so you stop juggling a dozen disconnected tools.",
	},
	{
		title: "You own your data.",
		desc: "It's your Postgres — exportable, portable, no lock-in. Ever.",
	},
	{
		title: "Simplicity is the product.",
		desc: "The best software disappears. We sweat the details so you never have to.",
	},
	{
		title: "Ship, don't assemble.",
		desc: "Spin up a workspace and go — the plumbing is already done and running.",
	},
];

const TEAM = [
	{ name: "Asher", role: "Co-founder · Engineering & Product", initials: "A" },
	{ name: "Reese", role: "Co-founder · Growth & Marketing", initials: "R" },
];

export default function AboutPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				{/* Mission */}
				<section className="page-gutter flex flex-col items-center border-border border-b py-32 text-center">
					<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
						QuickEngine Software
					</p>
					<h1 className="mt-6 max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						We're building the backend every business runs on.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						One company, one flagship — QuickDash — and one belief: running a
						business shouldn't mean stitching together a dozen tools that barely
						talk to each other.
					</p>
				</section>

				{/* Story */}
				<section className="page-gutter border-border border-b py-32">
					<div className="mx-auto max-w-2xl">
						<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
							Why we started.
						</h2>
						<p className="mt-8 text-lg text-muted-foreground leading-relaxed">
							Every business runs on the same handful of things — accounts,
							billing, files, search, notifications, jobs. Yet everyone rebuilds
							or rents them separately, wiring eight services together and
							maintaining the seams forever.
						</p>
						<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
							We think that's backwards. QuickEngine is one backend you own,
							shaped to your business, with the modules already built. Less
							plumbing, more building — for everyone from a solo freelancer to a
							scaling team.
						</p>
					</div>
				</section>

				{/* Values */}
				<section className="page-gutter border-border border-b py-32">
					<h2 className="max-w-2xl font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						What we believe.
					</h2>
					<div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
						{VALUES.map((value) => (
							<div key={value.title}>
								<h3 className="font-display text-foreground text-lg">
									{value.title}
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									{value.desc}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Team */}
				<section className="page-gutter border-border border-b py-32">
					<h2 className="font-display font-normal text-3xl text-foreground tracking-tight sm:text-4xl">
						The team.
					</h2>
					<div className="mt-16 grid max-w-2xl gap-8 sm:grid-cols-2">
						{TEAM.map((member) => (
							<div key={member.name} className="flex items-center gap-4">
								<div className="flex size-14 items-center justify-center rounded-full border border-border bg-secondary/40 font-display text-foreground text-lg">
									{member.initials}
								</div>
								<div>
									<p className="text-foreground">{member.name}</p>
									<p className="text-muted-foreground text-sm">{member.role}</p>
								</div>
							</div>
						))}
					</div>
				</section>

				{/* CTA */}
				<section className="page-gutter flex flex-col items-center py-32 text-center">
					<h2 className="font-display font-normal text-4xl text-foreground leading-[1.05] tracking-tight sm:text-5xl">
						Build with us.
					</h2>
					<p className="mt-6 max-w-xl text-muted-foreground">
						We're a small team building in the open. Come help — or just start
						building on what we've made.
					</p>
					<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
						<a
							href={`${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Get Started
						</a>
						<a
							href="/careers"
							className="inline-flex h-11 items-center rounded-full border border-border px-6 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5"
						>
							See open roles
						</a>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
