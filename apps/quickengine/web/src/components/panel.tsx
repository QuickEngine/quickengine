import type { ReactNode } from "react";

/**
 * The rounded surface the page continues on, below the hero.
 *
 * Written as a container rather than as one section because everything after
 * the hero sits on it — its rounded top edge is the transition out of the
 * gradient, and that should happen exactly once no matter how many sections get
 * added inside.
 *
 * The overlap is the point: it rides up over the bottom of the hero so the two
 * read as one surface sliding over another, rather than as two blocks stacked
 * with a seam between them.
 */
export function Panel({ children }: { children?: ReactNode }) {
	return (
		// z-20 to sit above the hero at z-10 — without it the hero's own stacking
		// context wins on overlap and the panel is clipped by the thing it is meant
		// to cover.
		//
		// The hero above is `sticky`, so scrolling pins it and slides this up over
		// the top of it.
		//
		// The negative margin is exactly the corner radius, so what shows above the
		// fold at rest is the curve and nothing else — enough to say another
		// surface is under this one, which is the whole job of an overlap before
		// anyone has scrolled. It was 96px and that ate into the hero to make a
		// point 32px makes better. Keep the two values equal if either changes.
		//
		// `min-h-dvh` is what gives the slide somewhere to travel. At 60vh the
		// panel ran out of page before it had covered the hero, and the effect
		// stopped halfway.
		//
		// Solid black against the gradient's pale bottom edge: the contrast is what
		// makes the rounded corners legible. On a matching colour the radius would
		// disappear and the overlap with it.
		// 🔴 NEVER put `overflow-hidden` on this section. `story.tsx` renders a
		// `sticky` column inside it, and ANY overflow value other than `visible` on
		// an ancestor silently downgrades sticky to ordinary scrolling — no error,
		// no warning, the pin just stops working. It was added here on 2026-08-10 to
		// clip the ambience and broke the story section within the hour. The ambience
		// layer below clips ITSELF instead, which is why it carries the radius too.
		<section className="-mt-8 relative z-20 min-h-dvh rounded-t-[2rem] bg-black">
			{/* Ambience. Below the hero the page was flat black for its entire
			    length, which reads as unfinished rather than as restraint.

			    ⚠️ Light only, NO HUE. Every coloured version of this looked like a
			    stock template, the page already has its colour in the hero ramp and
			    the ice accent, and adding a second one is what makes a dark site
			    look cheap. These are white at 4-6%, wide enough that no edge is ever
			    visible, and placed to sit BEHIND section boundaries so they read as
			    depth rather than as decoration on any one section.

			    Grain on top, because a gradient this large over black WILL band on
			    an 8-bit display and noise is the only fix that costs nothing. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-[2rem]"
			>
				<div
					className="absolute inset-x-0 top-0 h-[70rem]"
					style={{
						background:
							"radial-gradient(60% 45% at 18% 8%, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 70%)",
					}}
				/>
				<div
					className="absolute inset-x-0 top-[38%] h-[80rem]"
					style={{
						background:
							"radial-gradient(55% 40% at 88% 30%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 72%)",
					}}
				/>
				<div
					className="absolute inset-x-0 bottom-0 h-[70rem]"
					style={{
						background:
							"radial-gradient(65% 45% at 30% 92%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 70%)",
					}}
				/>
				<div className="noise-layer absolute inset-0" />
			</div>

			{/* The lit top edge. A 1px highlight along the rounded corner is what
			    separates a panel sliding over the hero from a black rectangle that
			    happens to have a radius. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[2rem] bg-gradient-to-r from-transparent via-white/15 to-transparent"
			/>

			<div className="relative">{children}</div>
		</section>
	);
}
