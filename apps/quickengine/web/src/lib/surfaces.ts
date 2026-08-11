/**
 * Shared page surfaces.
 *
 * ⚠️ Two rules, both learned the hard way on 2026-08-10.
 *
 * NO BLUE. These were built on `#24394c` navy and it read as default SaaS blue
 * washed across half a screen — the one place the page left its own palette.
 * Everything here is neutral now: graphite through to near-black, with light
 * added as WHITE rather than as a colour. The only colour on the page comes from
 * the ice accent and the hero ramp.
 *
 * NO TRANSLUCENT FILLS FOR CARDS. `bg-white/[0.03]` over black does not make a
 * grey, it makes mud — the alpha lifts the black unevenly and the edges go soft.
 * Card surfaces are SOLID hex, so they read as a deliberate material sitting on
 * the page instead of a smudge over it.
 */

/**
 * The lit desktop backdrop that windows sit on — Meet QuickDash.
 *
 * Graphite lit from the top left, the way a room is. Costs no asset and no
 * request, and being neutral it lets the ice accent inside the window be the
 * only colour in the frame.
 */
export const STAGE =
	"radial-gradient(115% 85% at 24% 4%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.035) 38%, rgba(255,255,255,0) 70%), linear-gradient(158deg, #303538 0%, #1b1f21 44%, #0b0d0e 100%)";

/**
 * The closing surface. Deliberately NOT `STAGE`.
 *
 * The CTA reused the stage until 2026-08-10 and the ending read as a repeat of
 * the middle of the page — the last thing a visitor sees should be the most
 * distinct thing on it, not a callback.
 *
 * The light here rises from BELOW the centre, so it comes from behind the input
 * rather than from a corner. Every other surface is lit from its top left like a
 * room; this one is lit by the thing it is asking you to touch, which is the
 * whole difference between a panel and a close. Cooler and dimmer than the
 * stage, so the ice button is the brightest thing in it.
 */
export const CLOSE =
	"radial-gradient(72% 58% at 50% 114%, rgba(220,231,237,0.26) 0%, rgba(220,231,237,0.07) 32%, rgba(255,255,255,0.015) 54%, rgba(255,255,255,0) 74%), linear-gradient(180deg, #0a0c0d 0%, #060708 100%)";

/**
 * Card and panel fill. Solid, not translucent — see the note above.
 *
 * A shade above the page's black so an edge is visible without a bright border
 * doing the work. Pair it with `border-white/[0.07]`: the fill says "material",
 * the hairline says "edge", and neither has to shout.
 */
export const CARD = "#101315";
