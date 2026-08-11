import { ICE } from "@/components/pill";
import { CARD } from "@/lib/surfaces";

/**
 * QuickConnect — keep the site you already have.
 *
 * The single strongest differentiator against Supabase and Firebase, and until
 * now it appeared on this page only as one answer inside the FAQ. It is also the
 * reply to the loudest objection there is, which is "I would have to rebuild
 * everything".
 *
 * Drawn as two ends and a bridge rather than written as a claim: the shape of
 * the diagram IS the argument — your side stays yours, our side is ours, and
 * the only new thing is the line between them.
 */

const YOURS = ["Your domain", "Your design", "Your framework", "Your code"];
const OURS = ["Orders", "Payments", "Inventory", "Everything else"];

function End({
	label,
	items,
	accent,
}: {
	label: string;
	items: string[];
	accent?: boolean;
}) {
	return (
		<div
			style={{ backgroundColor: CARD }}
			className="flex-1 rounded-2xl border border-white/[0.07] p-7"
		>
			<div
				style={accent ? { color: ICE } : undefined}
				className={`font-body font-normal text-[11px] uppercase tracking-[0.16em] ${accent ? "" : "text-white/35"}`}
			>
				{label}
			</div>
			<ul className="mt-5 flex flex-col gap-2.5">
				{items.map((item) => (
					<li
						key={item}
						className="font-body font-light text-[0.9375rem] text-white/70"
					>
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}

export function Connect() {
	return (
		<section className="pt-20 pb-28 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				<span className="sm:block">Keep the site you already have.</span>{" "}
				<span className="sm:block">Give it a backend.</span>
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				QuickConnect is a browser bridge from any frontend you own, any
				framework, or none, to your workspace. Nothing gets rewritten and
				nothing gets hosted here.
			</p>

			{/* Stacks on a phone with the bridge rotated to sit between the two ends,
			    so the reading order is the same at every width. */}
			<div className="mt-14 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:gap-6">
				<End label="Yours" items={YOURS} />

				<div className="flex shrink-0 flex-col items-center gap-2.5 lg:w-40">
					<div className="flex w-full items-center gap-2">
						<span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/25 max-lg:hidden" />
						<span
							style={{ borderColor: ICE, color: ICE }}
							className="whitespace-nowrap rounded-full border px-3.5 py-1.5 font-body font-light text-[0.8125rem]"
						>
							QuickConnect
						</span>
						<span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/25 max-lg:hidden" />
					</div>
					<span className="font-body font-light text-[11px] text-white/30">
						One line of setup
					</span>
				</div>

				<End label="Ours" items={OURS} accent />
			</div>
		</section>
	);
}
