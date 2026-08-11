import { CARD } from "@/lib/surfaces";

/**
 * The section that makes it safe to say yes.
 *
 * You are asking someone to put their orders, their customers and their money on
 * a platform nobody has heard of. The security work is real and none of it was
 * anywhere on this page.
 *
 * ⚠️ Every claim here is load-bearing and every one is currently true. Do not
 * add an aspirational line to this list — a security claim that is not yet
 * shipped is the single worst thing that can be on a marketing page, and this is
 * exactly the section where someone will check.
 *
 * SOC 2, ISO and penetration-test results are deliberately ABSENT. None exist
 * yet. When they do they belong here and they will be worth more than all four
 * of these together.
 */
const GUARANTEES = [
	{
		title: "Isolation you can check",
		body: "Every workspace is sealed from every other, and it is proven by tests that attack each API route with another tenant's credentials rather than by a promise in a document.",
	},
	{
		title: "Writes that cannot half-happen",
		body: "Domain state, the idempotency key, the audit entry and the outbox message all commit in one transaction. A retried request replays; it does not duplicate.",
	},
	{
		title: "Secrets encrypted at rest",
		body: "Provider tokens and credentials are encrypted in the database. Raw exception text and message bodies never reach logs or error reporting.",
	},
	{
		title: "Signed, replay-safe webhooks",
		body: "Outbound events are signed so you can verify they came from us, and carry the identifiers you need to reject anything you have already handled.",
	},
];

export function Trust() {
	return (
		<section className="pt-20 pb-28 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				<span className="sm:block">Your business runs on this.</span>{" "}
				<span className="sm:block">We build it that way.</span>
			</h2>

			<p className="mt-7 max-w-[58ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
				Four things that are true today, not on a roadmap.
			</p>

			<div className="mt-14 grid gap-4 md:grid-cols-2">
				{GUARANTEES.map((item) => (
					<div
						key={item.title}
						style={{ backgroundColor: CARD }}
						className="rounded-2xl border border-white/[0.07] p-7"
					>
						<h3 className="font-body font-normal text-[1.0625rem] text-white leading-snug">
							{item.title}
						</h3>
						<p className="mt-3 font-body font-light text-[0.9375rem] text-white/55 leading-[1.6]">
							{item.body}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
