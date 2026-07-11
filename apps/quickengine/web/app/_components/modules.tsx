"use client";

import {
	Broadcast,
	ChartLine,
	Cloud,
	CreditCard,
	EnvelopeSimple,
	Fingerprint,
	MagnifyingGlass,
	Plugs,
	Queue,
} from "@phosphor-icons/react";

const MODULES = [
	{
		name: "Auth",
		Icon: Fingerprint,
		desc: "Sessions, passkeys, 2FA, and SSO out of the box.",
	},
	{
		name: "Billing",
		Icon: CreditCard,
		desc: "Subscriptions, metering, and invoices on Stripe.",
	},
	{
		name: "Storage",
		Icon: Cloud,
		desc: "Files and media, CDN-backed and access-controlled.",
	},
	{
		name: "Search",
		Icon: MagnifyingGlass,
		desc: "Instant, typo-tolerant search across your data.",
	},
	{
		name: "Jobs",
		Icon: Queue,
		desc: "Background jobs and schedules that just run.",
	},
	{
		name: "Realtime",
		Icon: Broadcast,
		desc: "Live presence and updates over one connection.",
	},
	{
		name: "Analytics",
		Icon: ChartLine,
		desc: "Track events and answer questions without a warehouse.",
	},
	{
		name: "Webhooks",
		Icon: Plugs,
		desc: "Reliable, retried event delivery to anywhere.",
	},
	{
		name: "Email",
		Icon: EnvelopeSimple,
		desc: "Transactional email and templates, deliverable by default.",
	},
];

// Beat 3 — modules. The breadth grid, literal proof of "build more": everything
// the convergence diagram folds into one backend, laid out. Hairline separators
// between cells (gap-px over a border-colored track) tie into the divider motif.
export function Modules() {
	return (
		<section className="page-gutter border-border border-b py-40">
			<div className="max-w-2xl">
				<h2 className="font-display font-normal text-4xl text-foreground leading-[1.1] tracking-tight sm:text-5xl">
					Every module you'd otherwise wire up yourself.
				</h2>
				<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
					Switch them on per workspace — off by default, production-grade the
					moment you need them. No new vendors, no new bills.
				</p>
			</div>

			<div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
				{MODULES.map((m) => (
					<div key={m.name} className="bg-background p-6">
						<m.Icon className="size-5 text-foreground" />
						<h3 className="mt-4 font-display text-foreground text-lg">
							{m.name}
						</h3>
						<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
							{m.desc}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
