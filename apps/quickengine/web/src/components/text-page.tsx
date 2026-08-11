import { WaveBackground } from "@quickengine/ui/wave-background";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

/**
 * The shell for every text page: about, careers, contact, support, community,
 * partners, customers, case studies.
 *
 * Two parts, and the relationship between them is the whole idea. A centred
 * masthead on the gradient, treated like the head of an article, and a solid
 * panel underneath that SLIDES UP OVER IT as you scroll — the same mechanic the
 * front page uses between its hero and the section below.
 *
 * 🔴 NEVER put `overflow-hidden` on this component or any ancestor of it. The
 * masthead is `sticky`, and any overflow value other than `visible` on an
 * ancestor silently downgrades that to ordinary scrolling. No error, no warning,
 * the pin just stops working. It has already broken this effect twice elsewhere
 * in this app.
 *
 * ⚠️ Built as a shell on the first page rather than after the third. Eight pages
 * share this shape, and the alternative — pasting the layout into each route —
 * is eight files that agree today and drift the first time one is touched. The
 * policy pages already proved the value: converting `LegalPage` converted all
 * four at once.
 */
export function TextPage({
	title,
	lede,
	children,
	rounded = true,
}: {
	title: string;
	/** One line under the title. Optional — some pages are stronger without. */
	lede?: string;
	children: ReactNode;
	/**
	 * Rounded top corners on the sliding panel, matching the front page.
	 *
	 * Exposed as a prop purely so the two can be compared side by side without
	 * editing the shell. Once it is decided, collapse it — a permanent toggle for
	 * a decision that has been made is just a way for pages to disagree.
	 */
	rounded?: boolean;
}) {
	return (
		<div className="relative isolate min-h-dvh bg-black">
			<Header />

			{/* ⚠️ `fixed`, so it stays put while the panel travels over the masthead.
			    An `absolute` background inside the sticky section would scroll away
			    with it and the slide would have nothing behind it. */}
			<WaveBackground />

			{/* The masthead. 70dvh rather than a full screen: this is the head of an
			    article, not a hero, and a full viewport of nothing but a title makes a
			    reader scroll before they have been told anything.

			    It still needs a REAL height, a sticky element sized by its content
			    has nothing to stay pinned against. */}
			<section className="sticky top-[var(--banner-h)] z-10 flex h-[70dvh] items-center justify-center pt-[var(--header-h)] text-center site-gutter">
				{/* ⚠️ The measure goes on each element, NOT on a shared wrapper. A cap
				    on the parent silently becomes the ceiling for everything inside it,
				    so a wrapper narrow enough to keep the title from running edge to
				    edge also crushed the lede into the same column, which is what made
				    this look squeezed into the middle of the page. The two want very
				    different widths: a display line wants to break early, a paragraph
				    wants room to run. */}
				<div className="w-full">
					{/* ⚠️ TWO LINES MAXIMUM, one break. `20ch` is the constraint that enforces
					    it, and it is set for the PHONE rather than the desktop: `ch` scales
					    with the font, and the clamp bottoms out at 2.1rem on a narrow
					    screen, so a measure that gives two lines at 3.75rem gives three at
					    2.1rem. Twenty characters a line means any title up to about forty
					    characters fits in two at every width.

					    🔴 Keep every masthead title under ~40 characters. Nothing enforces
					    that in code, it is a writing rule, and a longer title silently
					    becomes a three-line heading on a phone. */}
					<h1 className="mx-auto max-w-[20ch] font-display font-light text-[clamp(2.1rem,5vw,3.75rem)] text-white leading-[1.08] tracking-[-0.025em]">
						{title}
					</h1>
					{lede ? (
						<p className="mx-auto mt-6 max-w-[56ch] font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55]">
							{lede}
						</p>
					) : null}
				</div>
			</section>

			{/* The panel. `z-20` to sit above the masthead at `z-10` — without it the
			    masthead's own stacking context wins on overlap and the panel is
			    clipped by the thing it is meant to cover.

			    The negative margin equals the corner radius, so what shows above the
			    fold at rest is the curve and nothing else. Keep them equal if either
			    changes.

			    `min-h-dvh` is what gives the slide somewhere to travel; without it a
			    short page runs out before it has covered anything. */}
			<div
				className={`-mt-8 relative z-20 min-h-dvh bg-black ${rounded ? "rounded-t-[2rem]" : ""}`}
			>
				{/* Centred column, left-aligned text.

				    ⚠️ A two-column rail with section titles beside the prose was tried
				    on 2026-08-10 and rejected as too wide. Worth recording WHY, because
				    the complaint before it was that the page looked narrow: it was never
				    the measure that was wrong. A thin strip of text under a full-width
				    centred masthead looks thin because the page around it is empty, and
				    spreading the text sideways to fill that space fixes the emptiness by
				    making the reading worse.

				    So the measure stays a reading measure, wider than the policy pages,
				    which are scanned rather than read, and nowhere near the width of the
				    screen. Structure does the work the width was being asked to do:
				    hairline rules between sections, quiet headings, real spacing. */}
				<main className="pt-24 pb-32 site-gutter">
					<div className="mx-auto max-w-[74ch]">{children}</div>
				</main>

				<Footer />
			</div>
		</div>
	);
}

/**
 * One section of a text page: a quiet heading with its body underneath.
 *
 * ⚠️ A component rather than bare `h2`/`p` styled by sibling selectors, because
 * the divider and the spacing belong to the SECTION, not to the heading. With
 * selectors, a section that happens to open with a list instead of a heading
 * loses its rule and its spacing silently.
 *
 * The heading is deliberately small and low-contrast. The masthead already
 * carried the display type; a second set of large headings underneath competes
 * with the thing people came to read, and on a page this length it turns the
 * body into something to be skimmed between headlines.
 */
export function TextSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="border-white/[0.07] border-t pt-12 pb-4 first:border-t-0 first:pt-0">
			<h2 className="font-body font-normal text-[0.8125rem] text-white/40 uppercase tracking-[0.14em]">
				{title}
			</h2>
			<div className="mt-6">{children}</div>
		</section>
	);
}

/**
 * Prose styling for the body of a text page.
 *
 * Separate from the policy pages' `prose` on purpose: those are legal documents
 * read under duress and are tuned for scanning, while these are meant to be
 * read start to finish. Slightly larger, more space between sections.
 */
export const textProse = [
	// No heading rules: `TextSection` owns those and puts them in the rail.
	"[&>p]:mt-5 [&>p:first-child]:mt-0 [&>p]:font-body [&>p]:font-light [&>p]:text-[1.0625rem] [&>p]:text-white/70 [&>p]:leading-[1.7]",
	"[&>ul]:mt-5 [&>ul]:list-disc [&>ul]:space-y-2.5 [&>ul]:pl-5",
	"[&>ul>li]:font-body [&>ul>li]:font-light [&>ul>li]:text-[1.0625rem] [&>ul>li]:text-white/70 [&>ul>li]:leading-[1.7]",
	"[&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-white/30 hover:[&_a]:decoration-white/70",
].join(" ");
