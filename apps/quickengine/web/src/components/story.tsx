import { useEffect, useRef, useState } from "react";
import { ICE } from "@/components/pill";
import { CARD } from "@/lib/surfaces";

/**
 * Scrollytelling: one order, followed end to end.
 *
 * The mechanism is lifted from the pre-rebuild `showcase.tsx` — a sticky left
 * column whose content is driven by an IntersectionObserver watching the steps
 * scrolling past on the right. It does not hijack the scroll; the page moves at
 * exactly the speed the visitor moves it, and only the pinned panel changes.
 *
 * ⚠️ The CONTENT is deliberately not the old component's. That version asked
 * "which business are you", which is what `configured-for.tsx` already does two
 * sections later — running both would make the page ask the same question twice.
 * This follows a single order through five modules instead, which is the one
 * claim nothing else on the page demonstrates: that the modules are wired to
 * each other, not just present in the same account.
 *
 * Every record below is invented.
 */
type Step = {
	module: string;
	title: string;
	blurb: string;
	state: { label: string; value: string; accent?: boolean }[];
};

const STEPS: Step[] = [
	{
		module: "Orders",
		title: "An order arrives",
		blurb:
			"It lands from your own storefront through QuickConnect. No middleware, no nightly sync, no copy of the truth living somewhere else.",
		state: [
			{ label: "Order", value: "#4417" },
			{ label: "Status", value: "Placed", accent: true },
			{ label: "Total", value: "$2,400.00" },
		],
	},
	{
		module: "Inventory",
		title: "Stock reserves itself",
		blurb:
			"The moment the order exists, the stock behind it is held. Nothing oversells while a payment is still in flight.",
		state: [
			{ label: "Order", value: "#4417" },
			{ label: "Status", value: "Reserved", accent: true },
			{ label: "On hand", value: "14 → 11" },
		],
	},
	{
		module: "Payments",
		title: "Payment captures",
		blurb:
			"Card, transfer or terms. The capture is idempotent, so a retried webhook can never take the money twice.",
		state: [
			{ label: "Order", value: "#4417" },
			{ label: "Status", value: "Paid", accent: true },
			{ label: "Captured", value: "$2,400.00" },
		],
	},
	{
		module: "Invoicing",
		title: "The invoice writes itself",
		blurb:
			"Issued from the order that earned it, with the lines already filled in. You are not charged for sending it.",
		state: [
			{ label: "Invoice", value: "INV-1042" },
			{ label: "Status", value: "Issued", accent: true },
			{ label: "Fee", value: "$0.00" },
		],
	},
	{
		module: "Shipping",
		title: "It goes out the door",
		blurb:
			"Label bought, tracking attached, customer notified. The order closes itself and the ledger already agrees.",
		state: [
			{ label: "Order", value: "#4417" },
			{ label: "Status", value: "Shipped", accent: true },
			{ label: "Tracking", value: "1Z99A4417" },
		],
	},
];

/** The pinned record. Only its values change as the story advances, which is
 *  the point being made — one record, five modules, never copied between them. */
function RecordCard({ step }: { step: Step }) {
	return (
		<div
			style={{ backgroundColor: CARD }}
			className="overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_30px_70px_-40px_rgba(0,0,0,0.9)]"
		>
			<div className="flex items-center justify-between border-white/[0.07] border-b px-5 py-3.5">
				<span className="font-body font-normal text-[13px] text-white">
					{step.module}
				</span>
				<span className="font-body font-light text-[11px] text-white/35">
					Live record
				</span>
			</div>

			<dl className="px-5 py-2">
				{step.state.map((field) => (
					<div
						key={field.label}
						className="flex items-baseline justify-between gap-6 border-white/[0.05] border-b py-3 last:border-b-0"
					>
						<dt className="font-body font-light text-[13px] text-white/40">
							{field.label}
						</dt>
						<dd
							style={{
								fontVariantNumeric: "tabular-nums",
								color: field.accent ? ICE : undefined,
							}}
							className={`font-body font-light text-[14px] ${field.accent ? "" : "text-white/85"}`}
						>
							{field.value}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

export function Story() {
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
			// Fires when a step crosses the vertical centre of the viewport, so the
			// pinned panel changes at the moment the matching text is being read.
			{ rootMargin: "-45% 0px -45% 0px", threshold: 0 },
		);
		for (const element of refs.current) {
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<section className="pt-20 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				One order, start to finish.
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				Five modules, one record. Nothing is exported, re-entered or reconciled
				between them.
			</p>

			<div className="grid gap-12 pb-28 lg:grid-cols-2 lg:gap-20">
				{/* The pinned column. Hidden below `lg` — a sticky panel needs a tall
				    viewport and a second column to sit beside, and on a phone it would
				    simply cover the text driving it. Small screens get the record
				    inline with each step instead, which tells the same story without
				    the mechanism. */}
				<div className="hidden lg:block">
					<div className="sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] flex-col justify-center gap-10">
						<div className="flex flex-col">
							{STEPS.map((step, i) => (
								<button
									key={step.module}
									type="button"
									onClick={() =>
										refs.current[i]?.scrollIntoView({
											behavior: "smooth",
											block: "center",
										})
									}
									className="flex items-center gap-4 py-2 text-start"
								>
									{/* The rail grows rather than lighting up — length reads as
									    progress through a sequence, where colour alone would
									    only read as selection. */}
									<span
										style={{ backgroundColor: active === i ? ICE : undefined }}
										className={`h-px transition-all duration-500 ease-out ${
											active === i ? "w-12" : "w-6 bg-white/20"
										}`}
									/>
									<span
										className={`font-body font-light text-[13px] transition-colors duration-500 ${
											active === i ? "text-white" : "text-white/35"
										}`}
									>
										{step.module}
									</span>
								</button>
							))}
						</div>

						<RecordCard step={STEPS[active]} />
					</div>
				</div>

				<div>
					{STEPS.map((step, i) => (
						<div
							key={step.module}
							data-index={i}
							ref={(element) => {
								refs.current[i] = element;
							}}
							className="flex min-h-[70vh] flex-col justify-center gap-7"
						>
							<div>
								<span
									style={{ color: ICE, fontVariantNumeric: "tabular-nums" }}
									className="font-body font-light text-[13px]"
								>
									{String(i + 1).padStart(2, "0")}
								</span>
								<h3 className="mt-3 font-display font-light text-[clamp(1.5rem,2.6vw,2rem)] text-white leading-tight tracking-[-0.02em]">
									{step.title}
								</h3>
								<p className="mt-4 max-w-[46ch] font-body font-light text-[0.9375rem] text-white/55 leading-[1.6]">
									{step.blurb}
								</p>
							</div>

							<div className="lg:hidden">
								<RecordCard step={step} />
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
