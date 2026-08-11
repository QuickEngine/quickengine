import { ICE } from "@/components/pill";
import { CARD } from "@/lib/surfaces";

/**
 * The pricing argument, drawn as a statement rather than written as a list.
 *
 * Third design. It was three "$0" cards, then a two-column ledger of hairline
 * rows — and the ledger had to go for a reason that had nothing to do with the
 * ledger: the capability section above it and the questions below it are BOTH
 * rows of text separated by rules, so the middle of the page had become one
 * texture for three straight screens. A section can be well made and still be
 * wrong because of what sits next to it.
 *
 * Showing a bill also argues better than describing one. A visitor reading "we
 * do not charge per invoice" has to take it on trust; a visitor looking at 412
 * invoices billed at $0.00 has already checked.
 *
 * ⚠️ NO RATES ANYWHERE. The metered lines show usage and the word "metered",
 * never a price. Invented per-GB or per-request figures on a public page are a
 * pricing claim people will screenshot and hold us to, and the real numbers are
 * not settled. The $0.00 column is safe because it is the promise itself, and it
 * is the only figure this section needs.
 */

// Business volume. Every one of these is a thing the customer earned, and every
// one is free at any size — that is hard rule 7 in `CLAUDE.md`, rendered.
const EARNED = [
	{ label: "Customers", usage: "1,284" },
	{ label: "Invoices sent", usage: "412" },
	{ label: "Orders processed", usage: "3,940" },
	{ label: "Records created", usage: "38,910" },
];

// Infrastructure. These cost real money to run, so they are metered.
const METERED = [
	{ label: "Storage", usage: "14.2 GB" },
	{ label: "Email and SMS", usage: "1,240 sent" },
	{ label: "AI", usage: "380 requests" },
	{ label: "Automations", usage: "2,410 runs" },
];

function Row({
	label,
	usage,
	amount,
	accent,
}: {
	label: string;
	usage: string;
	amount: string;
	accent?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-4 border-white/[0.06] border-b px-5 py-3.5 last:border-b-0 sm:px-7">
			<span className="min-w-0 flex-1 truncate font-body font-light text-[0.9375rem] text-white/85">
				{label}
			</span>
			<span
				style={{ fontVariantNumeric: "tabular-nums" }}
				className="shrink-0 font-body font-light text-[0.8125rem] text-white/35"
			>
				{usage}
			</span>
			<span
				style={{
					fontVariantNumeric: "tabular-nums",
					color: accent ? ICE : undefined,
				}}
				className={`w-[5.5rem] shrink-0 text-end font-body font-light text-[0.9375rem] ${accent ? "" : "text-white/40"}`}
			>
				{amount}
			</span>
		</div>
	);
}

export function PricingPromise() {
	return (
		<section className="pt-20 pb-32 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				<span className="sm:block">Charged for what it costs us.</span>{" "}
				<span className="sm:block">Never for what you earn.</span>
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(1rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				A real statement, at real volume. Everything you earned is free at any
				size, only the infrastructure underneath it is metered.
			</p>

			{/* A bounded document, not rows on the page. The border and the lifted
			    fill are what separate this from the sequence above it and the
			    questions below it, both of which are deliberately unbounded. */}
			<div
				style={{ backgroundColor: CARD }}
				className="mt-14 overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_30px_70px_-40px_rgba(0,0,0,0.9)]"
			>
				<div className="flex items-center justify-between gap-4 border-white/[0.07] border-b px-5 py-4 sm:px-7">
					<span className="font-body font-normal text-[0.9375rem] text-white">
						This month
					</span>
					<span className="font-body font-light text-[0.8125rem] text-white/35">
						Harbour Supply
					</span>
				</div>

				<div className="px-5 pt-5 pb-2 font-body font-light text-[10.5px] text-white/30 uppercase tracking-[0.16em] sm:px-7">
					What you earned
				</div>
				{EARNED.map((row) => (
					<Row key={row.label} {...row} amount="$0.00" accent />
				))}

				<div className="px-5 pt-7 pb-2 font-body font-light text-[10.5px] text-white/30 uppercase tracking-[0.16em] sm:px-7">
					What it costs to run
				</div>
				{METERED.map((row) => (
					<Row key={row.label} {...row} amount="metered" />
				))}

				{/* The line that does the work. Four figures of volume, and the only
				    number attached to any of them is zero. */}
				<div
					style={{ backgroundColor: "#15191b" }}
					className="flex items-baseline justify-between gap-4 border-white/[0.07] border-t px-5 py-5 sm:px-7"
				>
					<span className="font-body font-light text-[0.9375rem] text-white/70">
						Billed for 44,546 business records
					</span>
					<span
						style={{ color: ICE, fontVariantNumeric: "tabular-nums" }}
						className="font-display font-light text-[1.75rem] leading-none tracking-[-0.02em]"
					>
						$0.00
					</span>
				</div>
			</div>

			{/* Its own CTA. Every section below the fold should offer a way forward
			    from wherever the visitor happens to have stopped. */}
			<a
				href="/pricing"
				className="mt-12 inline-flex font-body font-light text-[15px] text-white/70 underline decoration-white/25 underline-offset-[6px] transition-colors duration-300 ease-out hover:text-white hover:decoration-white/60 hover:duration-150"
			>
				See the full pricing
			</a>
		</section>
	);
}
