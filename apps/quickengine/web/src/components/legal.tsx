import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

/**
 * The shell every policy page renders inside: terms, privacy, cookies, refund.
 *
 * ⚠️ THE WORDS ARE NOT MINE TO EDIT. All four pages are byte-identical to
 * `internal/snapshots/web-prerebuild`, which is the reviewed text and the only
 * source for it. This pass changed the chrome and the typography around that
 * text and did not touch a single sentence of it.
 *
 * 🔴 Do NOT rewrite policy copy from `internal/master/*.pdf`. Those PDFs predate
 * the current text and were superseded; Asher's instruction on 2026-08-10 was
 * explicit that the web snapshots are the reference and the master documents are
 * outdated. A policy page that drifts from the reviewed version is a legal
 * problem, not a content problem.
 *
 * Converting this one file converts all four pages, which is the whole reason
 * they were built on a shared shell.
 */

/**
 * Prose styling, applied to the semantic children so each page writes plain
 * `h2`/`p`/`ul` and inherits the type scale.
 *
 * ⚠️ Long-form reading, so this deliberately does NOT reuse the marketing type
 * scale. Section headings here are the size of a paragraph lead rather than a
 * display heading — a policy is twenty screens of text, and marketing-sized
 * headings turn it into something that has to be scrolled past rather than read.
 * Body sits at 16px with generous leading for the same reason, and the measure
 * is capped so lines stay readable at full width.
 */
const prose = [
	"mt-12",
	"[&_h2]:mt-14 [&_h2]:font-body [&_h2]:font-normal [&_h2]:text-[1.0625rem] [&_h2]:text-white [&_h2]:leading-snug",
	"[&_p]:mt-4 [&_p]:font-body [&_p]:font-light [&_p]:text-[1rem] [&_p]:text-white/70 [&_p]:leading-[1.7]",
	"[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5",
	"[&_li]:font-body [&_li]:font-light [&_li]:text-[1rem] [&_li]:text-white/70 [&_li]:leading-[1.7]",
	"[&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-white/30 hover:[&_a]:decoration-white/70",
].join(" ");

export function LegalPage({
	title,
	updated,
	children,
}: {
	title: string;
	updated: string;
	children: ReactNode;
}) {
	return (
		<div className="relative isolate min-h-dvh bg-black">
			<Header />

			{/* No gradient behind a policy. The wave is the marketing site's voice and
			    it moves, under twenty screens of text it is a distraction, and text
			    this long has to stay legible over whatever is behind it at every
			    scroll position. Flat black is the honest surface for it. */}
			<main className="pt-[calc(var(--header-h)+6rem)] pb-32 site-gutter">
				{/* Centred column, left-aligned text — the same shape it had before this
				    pass, and the right one.

				    ⚠️ It was briefly pinned to the left gutter so the column lined up
				    with the header and footer marks. That argument does not survive
				    contact with a wide screen: a 68-character measure held against the
				    left edge leaves a large empty field to the right that pulls the eye
				    off the text, and this is twenty screens of reading rather than a
				    marketing section. Centring the measure is what long-form pages do.

				    The TEXT stays left-aligned. Centred prose is unreadable at this
				    length because every line starts in a different place. */}
				<div className="mx-auto max-w-[68ch]">
					<h1 className="font-display font-light text-[clamp(1.9rem,4.2vw,3.15rem)] text-white leading-[1.1] tracking-[-0.025em]">
						{title}
					</h1>
					<p className="mt-5 font-body font-light text-[0.9375rem] text-white/40">
						Last updated {updated}
					</p>

					<div className={prose}>{children}</div>
				</div>
			</main>

			<Footer />
		</div>
	);
}

/**
 * Table styling for the policy tables.
 *
 * ⚠️ `overflow-x-auto` is correct HERE and was removed from the pricing compare
 * table for a reason worth remembering: a horizontal scroll container also
 * becomes a vertical one, which breaks `position: sticky` inside it. Nothing in
 * these tables is sticky, and a data table genuinely can exceed a phone's width,
 * so it stays.
 */
export const legalTable = [
	"mt-8 overflow-x-auto rounded-xl border border-white/[0.09]",
	"[&_th]:border-white/[0.09] [&_th]:border-b [&_th]:bg-white/[0.03] [&_th]:px-4 [&_th]:py-3 [&_th]:text-left",
	"[&_th]:font-body [&_th]:font-normal [&_th]:text-[0.875rem] [&_th]:text-white",
	"[&_td]:px-4 [&_td]:py-3 [&_td]:align-top",
	"[&_td]:font-body [&_td]:font-light [&_td]:text-[0.875rem] [&_td]:text-white/70",
	"[&_tbody_tr]:border-white/[0.06] [&_tbody_tr]:border-b [&_tbody_tr:last-child]:border-b-0",
].join(" ");
