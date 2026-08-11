/**
 * Objection handling, immediately before the close.
 *
 * An accordion rather than a list of paragraphs, for one reason: collapsed, the
 * whole section is five lines. Someone who has no doubts scrolls past it in a
 * second, and someone who has one finds it without reading the other four. A
 * page that answers objections does not have to be long — it has to be
 * answerable.
 *
 * Native `<details>`, not React state. Keyboard support, screen-reader
 * semantics and find-in-page all work without writing any of it, and
 * find-in-page matters here: a browser can open a closed `<details>` to reveal a
 * match, which no hand-rolled accordion does.
 *
 * ⚠️ Every answer here is a public commitment. Two are load-bearing and worth
 * re-checking before launch:
 *  - The Supabase/Firebase comparison names competitors. It is factual rather
 *    than disparaging, and it should stay that way.
 *  - The data answer says records are reachable through the API, which is true
 *    of all 145 operations. It deliberately stops short of promising a one-click
 *    export, because no export feature exists yet. If one ships, say so here —
 *    it is the stronger answer.
 */
const QUESTIONS = [
	{
		q: "Do I have to rewrite my frontend?",
		a: "No. QuickConnect bridges any site you already own, any framework, or none at all, to your workspace. You keep the storefront you have; it gets a backend behind it.",
	},
	{
		q: "How is this different from Supabase or Firebase?",
		a: "Those hand you a database and you build the business on top of it. QuickDash ships the business already built: orders, invoices, inventory, bookings and the rest, wired together and talking to each other on day one.",
	},
	{
		q: "Is my data locked in?",
		a: "No. Every record is reachable through the same API your own apps use, in ordinary JSON. Nothing is held in a shape only we can read.",
	},
	{
		q: "Do I need a developer?",
		a: "To run the workspace, no. To connect your own site to it, yes, someone comfortable with a little code. The CLI and the SDK exist to make that a short job rather than a project.",
	},
	{
		q: "What does it cost once I grow?",
		a: "Resources scale with what you use; the business you build on top never costs anything. Growing does not change the price of a customer, an invoice or a record, because those are free at any volume.",
	},
];

export function Questions() {
	return (
		<section className="pt-20 pb-32 site-gutter">
			<h2 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
				Questions worth <span className="font-medium">asking</span>.
			</h2>

			<dl className="mt-14 border-white/10 border-t">
				{QUESTIONS.map((item) => (
					<details key={item.q} className="group border-white/10 border-b">
						{/* `list-none` plus the webkit rule removes the default disclosure
						    triangle in every engine, one alone leaves it showing in
						    Safari. */}
						<summary className="flex cursor-pointer list-none items-center justify-between gap-8 py-6 [&::-webkit-details-marker]:hidden">
							<dt className="font-body font-light text-[clamp(1.0625rem,1.6vw,1.25rem)] text-white leading-snug">
								{item.q}
							</dt>

							{/* A plus that becomes a minus by rotating one of its two
							    strokes. Cheaper than swapping icons and it animates, which
							    a swap cannot. */}
							<span
								aria-hidden="true"
								className="relative size-4 shrink-0 text-white/40 transition-colors duration-300 group-hover:text-white"
							>
								<span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
								<span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 rotate-90 bg-current transition-transform duration-300 ease-out group-open:rotate-0" />
							</span>
						</summary>

						<dd className="max-w-[70ch] pb-7 font-body font-light text-[0.9375rem] text-white/55 leading-[1.6]">
							{item.a}
						</dd>
					</details>
				))}
			</dl>
		</section>
	);
}
