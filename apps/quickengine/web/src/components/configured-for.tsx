import { useState } from "react";
import { GREY, ICE, Pill } from "@/components/pill";
import { env } from "@/lib/env";

const AUTH_URL = env.VITE_AUTH_URL;

/**
 * Capability, organised by business rather than by module.
 *
 * ⚠️ The framing here is the whole point, and it is the easiest thing to lose in
 * a later edit. Research on SaaS landing pages is blunt about it: building this
 * section around features instead of outcomes is the most common reason pages
 * like this fail to convert. So every line below describes something the
 * VISITOR'S business does, not something QuickDash has. "Stock counts that stay
 * right across every channel", never "Inventory module".
 *
 * The business-type switcher is doing two jobs. It lets someone find themselves
 * on the page instead of reading a generic list, and it demonstrates the actual
 * product claim — one substrate, configured per business — by showing the set
 * change rather than by asserting it in a sentence.
 *
 * Every module named here is real and lives in `packages/modules`. Sixteen exist;
 * each configuration shows six, and the page says so rather than implying six is
 * all there is.
 */

type Capability = { label: string; outcome: string };

const CONFIGURATIONS: { type: string; capabilities: Capability[] }[] = [
	{
		type: "Retail shop",
		capabilities: [
			{
				label: "Products",
				outcome: "Your catalogue, variants and pricing in one place.",
			},
			{
				label: "Inventory",
				outcome: "Stock counts that stay right across every channel.",
			},
			{
				label: "Orders",
				outcome: "Every order tracked from placed to delivered.",
			},
			{
				label: "Payments",
				outcome: "Take money the way your customers want to pay.",
			},
			{
				label: "Fulfilment",
				outcome: "Pick, pack and mark shipped without a spreadsheet.",
			},
			{
				label: "Shipping",
				outcome: "Live rates and labels, settled at checkout.",
			},
		],
	},
	{
		type: "Design agency",
		capabilities: [
			{
				label: "Clients",
				outcome: "Every contact and conversation on one thread.",
			},
			{
				label: "Projects",
				outcome: "Work broken down, assigned, and actually tracked.",
			},
			{
				label: "Time",
				outcome: "Hours logged against the job that earned them.",
			},
			{
				label: "Quotes",
				outcome: "Scope a piece of work and send it the same day.",
			},
			{
				label: "Invoicing",
				outcome: "Bill straight from the hours already logged.",
			},
			{
				label: "Files",
				outcome: "Deliverables shared without a third-party link.",
			},
		],
	},
	{
		type: "Consultancy",
		capabilities: [
			{
				label: "Clients",
				outcome: "Every contact and conversation on one thread.",
			},
			{
				label: "Bookings",
				outcome: "Availability, scheduling and reminders that hold.",
			},
			{
				label: "Contracts",
				outcome: "Signed and countersigned before the work starts.",
			},
			{
				label: "Invoicing",
				outcome: "Retainers and one-offs, billed on time.",
			},
			{
				label: "Payments",
				outcome: "Take money the way your clients want to pay.",
			},
			{
				label: "Reporting",
				outcome: "Where the revenue came from, without a warehouse.",
			},
		],
	},
	{
		type: "Trades",
		capabilities: [
			{ label: "Clients", outcome: "Every site, contact and job history." },
			{
				label: "Bookings",
				outcome: "Jobs scheduled around the crew you actually have.",
			},
			{
				label: "Quotes",
				outcome: "Price the job while you are standing in it.",
			},
			{
				label: "Invoicing",
				outcome: "Invoice before you are out of the driveway.",
			},
			{ label: "Payments", outcome: "Card, transfer or terms. Their choice." },
			{ label: "Files", outcome: "Photos and paperwork attached to the job." },
		],
	},
];

export function ConfiguredFor() {
	const [index, setIndex] = useState(0);
	const active = CONFIGURATIONS[index];

	return (
		<section className="pt-20 pb-32 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				<span className="block">Configured for the way you already work.</span>
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(1rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				Every workspace draws from the same sixteen modules. What changes is
				which of them are running, and nothing you do not need is in your way.
			</p>

			{/* Real buttons rather than a styled row of divs, so keyboard and screen
			    reader support comes for free and `aria-pressed` carries the state. */}
			<div className="mt-10 flex flex-wrap gap-2">
				{CONFIGURATIONS.map((config, i) => {
					const on = i === index;
					return (
						<button
							key={config.type}
							type="button"
							aria-pressed={on}
							onClick={() => setIndex(i)}
							style={
								on
									? { backgroundColor: ICE, color: "#000000" }
									: { backgroundColor: GREY, color: ICE }
							}
							className="inline-flex h-8 items-center rounded-full px-4 font-body font-light text-[13px] leading-none transition-opacity duration-300 ease-out hover:opacity-85 hover:duration-150 focus-visible:opacity-85"
						>
							{config.type}
						</button>
					);
				})}
			</div>

			{/* A numbered sequence, not a grid. These six are not a feature list —
			    they are the order the work actually happens in, and a grid throws
			    that away by making every cell equal and unordered. Numbering them
			    turns the section into "here is how your business runs", which is the
			    same information doing considerably more work.

			    Keyed on the business type so React remounts the rows and the cascade
			    replays on every switch. Without the key the text swaps in place and
			    the change is easy to miss entirely. */}
			<ol key={active.type} className="mt-12 border-white/10 border-t">
				{active.capabilities.map((capability, i) => (
					<li
						key={capability.label}
						// Each row enters 55ms after the one above it, so the chain builds
						// top to bottom instead of appearing all at once.
						style={{ animationDelay: `${i * 55}ms` }}
						className="flex flex-col gap-1.5 border-white/10 border-b py-5 config-row sm:flex-row sm:items-baseline sm:gap-6"
					>
						<span
							style={{ color: ICE, fontVariantNumeric: "tabular-nums" }}
							className="w-7 shrink-0 font-body font-light text-[0.8125rem] leading-snug"
						>
							{String(i + 1).padStart(2, "0")}
						</span>
						<h3 className="shrink-0 font-body font-normal text-[1.0625rem] text-white leading-snug sm:w-[11rem]">
							{capability.label}
						</h3>
						<p className="font-body font-light text-[0.9375rem] text-white/55 leading-[1.5]">
							{capability.outcome}
						</p>
					</li>
				))}
			</ol>

			<p className="mt-10 font-body font-light text-[0.9375rem] text-white/40">
				Six of sixteen modules. The rest are a switch away.
			</p>

			{/* The primary CTA, repeated. Guidance is consistent that it belongs in
			    the hero, again after the capability sections, and again near the
			    bottom, before this the page asked once and then never again. */}
			<div className="mt-12">
				<Pill
					href={`${AUTH_URL}/signup`}
					variant="primary"
					size="lg"
					disc="launch"
				>
					Get Started
				</Pill>
			</div>
		</section>
	);
}
