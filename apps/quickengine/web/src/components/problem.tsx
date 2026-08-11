/**
 * The problem, stated before anything is sold.
 *
 * This is the beat the page was missing. It went from an ambition straight to a
 * product, which spends attention without ever earning it — and the pricing
 * section further down rebuts a per-customer billing model the reader has never
 * been shown. Naming the cost first is what makes everything below it land.
 *
 * The tokens are the thing to keep. A paragraph saying "you rebuild the same
 * backend every time" is a claim; sixteen names a developer recognises, greyed
 * out and repeated, is the feeling of having done it.
 */

// The real module set from `packages/modules`. Shown as the work you would
// otherwise do yourself — which is exactly what it is.
const REBUILT = [
	"Auth",
	"Clients",
	"Products",
	"Inventory",
	"Orders",
	"Payments",
	"Invoicing",
	"Quotes",
	"Contracts",
	"Bookings",
	"Projects",
	"Time",
	"Files",
	"Fulfilment",
	"Shipping",
	"Reporting",
];

export function Problem() {
	return (
		<section className="pt-20 pb-28 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				<span className="sm:block">You have built this before.</span>{" "}
				<span className="sm:block">Probably more than once.</span>
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				Every business needs the same machinery underneath it. So you build it
				again, or you rent six tools that do not talk to each other and charge
				you more the better you do.
			</p>

			{/* Outlined and dim, deliberately: these read as work sitting in front of
			    you rather than as features on offer. The section two below shows the
			    same names lit up, which is the whole turn the page makes. */}
			<div className="mt-12 flex flex-wrap gap-2.5">
				{REBUILT.map((item) => (
					<span
						key={item}
						className="rounded-full border border-white/[0.09] px-3.5 py-1.5 font-body font-light text-[0.8125rem] text-white/35"
					>
						{item}
					</span>
				))}
			</div>

			<p className="mt-8 font-body font-light text-[0.9375rem] text-white/40">
				Sixteen of them. Every project, from scratch.
			</p>
		</section>
	);
}
