import { Convergence } from "./_components/convergence";
import { Hero } from "./_components/hero";
import { Modules } from "./_components/modules";
import { Showcase } from "./_components/showcase";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

export default async function Page() {
	// Returning users should land in the product, not be sold the product again. Account is
	// the stable control plane and routes incomplete accounts into onboarding. A future
	// persisted last-workspace preference can safely tighten this to QuickDash.
	if (await getSession(await headers())) redirect(ACCOUNT_URL);

	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				{/* Hero — marketing claim and authenticated product entry. */}
				<Hero />

				{/* Everything below the hero scrolls up and over it: the hero is
				    sticky (z-0) underneath; this wrapper is opaque (z-10) with a rounded
				    top edge + upward shadow, so it reads as a sheet sliding over the
				    hero. */}
				<div className="relative z-10 rounded-t-3xl border-border border-t bg-background shadow-[0_-24px_64px_-24px_rgba(0,0,0,0.6)]">
					{/* Beat 1 — self-identification. Sticky scrollytelling: pick your
				    business type and watch its tailored workspace assemble. Highest
				    signal, so it sits right after the hero. */}
					<Showcase />

					{/* Beat 1 — the "why". Reframes the pain (a stack of disconnected
				    tools) into the promise (one backend you own), and lands the
				    positioning line. No section label — the statement carries it.
				    Placement + provisional copy; styling comes in the polish pass. */}
					<section className="page-gutter border-border border-b py-40">
						<div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
							{/* Text sits in the right column on desktop; the left-side visual
						    balances it (right-side text needs a left anchor for the eye).
						    Text itself stays left-aligned for readability. */}
							<div className="lg:order-2">
								<h2 className="font-display font-normal text-4xl text-foreground leading-[1.1] tracking-tight sm:text-5xl">
									Most businesses run on a dozen tools that barely talk to each
									other.
								</h2>
								<p className="mt-8 text-lg text-muted-foreground leading-relaxed">
									Every one is another bill, another integration, another thing
									that breaks at 2am. QuickDash replaces the whole stack with a
									single backend you own — auth, billing, storage, search, jobs,
									realtime — configured per workspace for exactly how your
									business runs.
								</p>
								<p className="mt-10 font-display text-2xl text-foreground sm:text-3xl">
									Build your backend. Bring your own frontend. Ship.
								</p>
							</div>

							{/* Visual — convergence diagram: scattered capabilities wired into
						    one QuickDash backend. */}
							<div className="lg:order-1">
								<Convergence />
							</div>
						</div>
					</section>

					{/* Beat 2 — how it works, no label. Lead statement → the product
				    preview (swap-ready window) → the three moves. The order of the
				    moves is real (workspace before modules before frontend), so it reads
				    as a sequence without needing 01/02/03 markers. Placement +
				    provisional copy; styling comes in the polish pass. */}
					<section className="page-gutter border-border border-b py-40">
						<h2 className="max-w-3xl font-display font-normal text-3xl text-foreground leading-[1.1] tracking-tight sm:text-5xl">
							A production backend in minutes, not months.
						</h2>
						<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
							Spin up a workspace, switch on the modules you need, and point
							your frontend at one clean API. No servers to manage, no glue code
							to maintain.
						</p>

						{/* Product preview — a contained backdrop panel (respects the gutter)
					    with a smaller window centered inside it. Swap the inner slot for a
					    screenshot, a <video>, or a live interactive QuickDash embed. */}
						<div className="mt-16 rounded-2xl bg-secondary/40 px-6 py-16 sm:px-10 lg:px-16">
							<div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-background/60 shadow-2xl shadow-black/40 ring-1 ring-white/5">
								<div className="flex h-10 items-center gap-2 border-border border-b bg-background/40 px-4">
									<span className="size-3 rounded-full bg-white/15" />
									<span className="size-3 rounded-full bg-white/15" />
									<span className="size-3 rounded-full bg-white/15" />
								</div>
								<div className="relative aspect-[16/10] w-full" />
							</div>
						</div>

						{/* The three moves */}
						<div className="mt-16 grid gap-10 sm:grid-cols-3">
							<div>
								<h3 className="font-display text-foreground text-xl">
									Spin up a workspace
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									Pick your business type — e-commerce, agency, freelancer — and
									get a backend shaped for exactly how it runs.
								</p>
							</div>
							<div>
								<h3 className="font-display text-foreground text-xl">
									Switch on modules
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									Auth, billing, storage, search, jobs, realtime. Toggle on what
									you need, ignore the rest — no rebuilds.
								</p>
							</div>
							<div>
								<h3 className="font-display text-foreground text-xl">
									Bring your frontend
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									Point any frontend at one clean API and ship. Web, mobile,
									native — you own the interface, we run the backend.
								</p>
							</div>
						</div>
					</section>

					{/* Beat 3 — modules (breadth grid). */}
					<Modules />

					{/* Closing CTA — bookends the hero with the tagline, right above the
				    footer. Placement-first for now; styling comes in the polish pass. */}
					<section className="page-gutter flex flex-col items-center py-40 text-center">
						<h2 className="max-w-3xl font-display font-normal text-4xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
							Build more. Switch less.
						</h2>
						<p className="mt-6 max-w-xl text-muted-foreground">
							One backend for every part of your business. Spin up a workspace
							and ship today.
						</p>
						<div className="mt-10 flex flex-wrap items-center justify-center gap-3">
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
				</div>
			</main>
			<SiteFooter />
		</>
	);
}

import { getSession } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
