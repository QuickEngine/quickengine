import { Pill } from "@/components/pill";
import { env } from "@/lib/env";

const AUTH_URL = env.VITE_AUTH_URL;

/**
 * The front-page hero. Left aligned, sitting over the wave gradient.
 *
 * Rebuilt 2026-08-10 for the Step 10 design pass.
 *
 * Two weights carry the whole thing: Söhne Leicht for the sentence and Kräftig
 * for the phrase being emphasised. No third weight, no colour change, no size
 * change — the contrast between 300 and 500 at this size is enough on its own,
 * and reaching for more is what makes a headline look busy.
 */
export function Hero() {
	return (
		// `sticky top-0`, so the hero pins to the viewport and the panel below
		// scrolls up over it rather than pushing it off the screen. This needs an
		// exact height — `h-dvh`, not `min-h` — because a sticky element with no
		// resolved height has nothing to stick against and simply scrolls away.
		//
		// z-10 clears the fixed background at z-0, and sits under the panel's z-20
		// so the panel wins where they overlap.
		//
		// ⚠️ The banner offsets BOTH the pin and the height. Only the top would
		// leave the hero a banner's worth taller than the space it has, so its
		// bottom edge would sit below the fold and the panel's overlap — which is
		// measured from that edge — would start off-screen.
		//
		// The panel below is deliberately untouched. Its `-mt-8` is relative to the
		// hero, so it travels with it and the overlap stays exactly what it was.
		//
		// The header offset is padding, NOT margin. Margin would push the sticky
		// box itself down and it would pin 4rem below the top edge, leaving a strip
		// of the panel visible above it.
		<section className="sticky top-[var(--banner-h)] z-10 flex h-[calc(100dvh-var(--banner-h))] items-center pt-[var(--header-h)] site-gutter">
			{/* The section is the centring flex container, so everything inside it
			    needs to be ONE child, otherwise the headline, paragraph and
			    buttons become three flex items and lay out side by side. */}
			<div className="w-full">
				{/* ⚠️ Block spans, not `<br />`. Two reasons, both of which bit
				    already: a `<br />` written across source lines leaves a space that
				    JSX joins onto the START of the next line, indenting it by a
				    character; and a responsive `hidden md:block` break silently does
				    nothing below 768px, which is narrower than a lot of laptop
				    windows. These break in the same place at every width, with no
				    stray whitespace. */}
				<h1 className="font-display font-light text-[clamp(1.9rem,6.2vw,4.75rem)] text-white leading-[1.08] tracking-[-0.02em] sm:leading-[1.06] sm:tracking-[-0.025em]">
					<span className="sm:block">Building the operating system</span>{" "}
					<span className="sm:block">for modern businesses.</span>
				</h1>

				<p className="mt-5 font-body font-light text-[clamp(0.9375rem,1.35vw,1.125rem)] text-white/70 leading-[1.55] sm:mt-7">
					<span className="sm:block">
						Connect the tools, workflows, and systems that power your
					</span>{" "}
					<span className="sm:block">
						business, all through one growing ecosystem.
					</span>
				</p>

				{/* Stacked and full width below `sm`, side by side above it. Two
				    half-width pills on a phone leave both too narrow to read and too
				    small to hit; full width means a thumb does not have to aim.
				    12px apart, comfortably past the 4px floor, and enough that
				    neither reads as attached to the other. */}
				<div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
					{/* Two discs, two meanings. `launch` leaves the marketing site for
					    the product; `arrow` continues on it. That is why Get Started now
					    points at signup rather than at a marketing page, an up-right
					    arrow that lands you on another brochure is a lie the visitor
					    notices immediately. */}
					<Pill
						href={`${AUTH_URL}/signup`}
						variant="primary"
						size="lg"
						disc="launch"
						block
					>
						Get Started Free
					</Pill>
					<Pill
						href="/business"
						variant="secondary"
						size="lg"
						disc="arrow"
						block
					>
						Explore Solutions
					</Pill>
				</div>
			</div>
		</section>
	);
}
