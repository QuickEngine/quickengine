"use client";

import { useEffect, useRef, useState } from "react";

type Step = { type: string; blurb: string; modules: string[] };

const STEPS: Step[] = [
	{
		type: "E-commerce",
		blurb:
			"Storefronts, inventory, orders, and payments — a backend that already speaks retail out of the box.",
		modules: ["Auth", "Billing", "Storage", "Search", "Inventory"],
	},
	{
		type: "Agencies",
		blurb:
			"Client workspaces, projects, files, and invoicing — isolated and billable per client, no spreadsheets.",
		modules: ["Auth", "Projects", "Files", "Invoicing", "Billing"],
	},
	{
		type: "Freelancers",
		blurb:
			"Contacts, invoices, and files without a stack of SaaS subscriptions eating your margin every month.",
		modules: ["Auth", "Invoicing", "Files", "Contacts"],
	},
	{
		type: "SaaS",
		blurb:
			"Auth, metering, webhooks, and analytics — the plumbing every app reinvents, already built and running.",
		modules: ["Auth", "Billing", "Analytics", "Webhooks", "Jobs"],
	},
];

// The tailored workspace "window" for a given business type. Placeholder — the
// swap-ready body currently just lists the modules that ship enabled.
function WorkspaceWindow({ step }: { step: Step }) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-background/60 shadow-2xl shadow-black/40 ring-1 ring-white/5">
			<div className="flex h-10 items-center gap-2 border-border border-b bg-background/40 px-4">
				<span className="size-3 rounded-full bg-white/15" />
				<span className="size-3 rounded-full bg-white/15" />
				<span className="size-3 rounded-full bg-white/15" />
				<span className="ml-2 text-[11px] text-muted-foreground">
					{step.type} workspace
				</span>
			</div>
			<div className="p-8">
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
					Modules enabled
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					{step.modules.map((m) => (
						<span
							key={m}
							className="rounded-full border border-border px-3 py-1 text-[13px] text-foreground"
						>
							{m}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

// Beat 1 (right after the hero) — the highest-signal move: self-identification.
// Scrollytelling. The left column pins (sticky, non-hijacking) with a scrollspy
// rail + the tailored workspace visual; scrolling the right column's steps
// drives which business type is active. Every visitor finds themselves.
export function Showcase() {
	const [active, setActive] = useState(0);
	const refs = useRef<(HTMLDivElement | null)[]>([]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActive(Number((entry.target as HTMLElement).dataset.index));
					}
				}
			},
			// Fire when a step crosses the vertical center of the viewport.
			{ rootMargin: "-45% 0px -45% 0px", threshold: 0 },
		);
		for (const el of refs.current) {
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<section className="page-gutter border-border border-b">
			<div className="max-w-2xl pt-40">
				<h2 className="font-display font-normal text-4xl text-foreground leading-[1.1] tracking-tight sm:text-5xl">
					One platform, shaped to your business.
				</h2>
				<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
					QuickDash configures itself around how you actually operate. Pick your
					type and the right modules are already on — no assembly required.
				</p>
			</div>

			<div className="grid gap-12 pb-40 lg:grid-cols-2 lg:gap-16">
				{/* Left: pinned scrollspy rail + tailored workspace visual. */}
				<div className="hidden lg:block">
					<div className="sticky top-16 flex h-[calc(100dvh-4rem)] flex-col justify-center gap-10">
						<div className="flex flex-col gap-1">
							{STEPS.map((s, i) => (
								<button
									key={s.type}
									type="button"
									onClick={() =>
										refs.current[i]?.scrollIntoView({
											behavior: "smooth",
											block: "center",
										})
									}
									className={`flex items-center gap-4 py-2 text-left transition-colors ${
										active === i
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<span
										className={`h-px transition-all duration-300 ${
											active === i ? "w-12 bg-foreground" : "w-6 bg-border"
										}`}
									/>
									<span className="text-sm">{s.type}</span>
								</button>
							))}
						</div>

						<WorkspaceWindow step={STEPS[active]} />
					</div>
				</div>

				{/* Right: the scrolling steps that drive the active index. */}
				<div>
					{STEPS.map((s, i) => (
						<div
							key={s.type}
							data-index={i}
							ref={(el) => {
								refs.current[i] = el;
							}}
							className="flex min-h-[80vh] flex-col justify-center gap-8"
						>
							<div>
								<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
									Built for
								</p>
								<h3 className="mt-3 font-display font-normal text-3xl text-foreground sm:text-4xl">
									{s.type}
								</h3>
								<p className="mt-4 max-w-md text-lg text-muted-foreground leading-relaxed">
									{s.blurb}
								</p>
							</div>

							{/* Mobile-only visual (the pinned column is hidden below lg). */}
							<div className="lg:hidden">
								<WorkspaceWindow step={s} />
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
