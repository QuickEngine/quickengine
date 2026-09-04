/**
 * The wave behind the console.
 *
 * Ported from the account app's onboarding screen, which is the only place in
 * the product that has ever had a ground worth looking at. The console painted
 * a flat `--console-floor` and every panel sat on it like paper on a desk; the
 * panels are the work, but the desk can be something.
 *
 * ── The layout ───────────────────────────────────────────────────────────────
 *
 * A wave rising out of the BOTTOM-LEFT corner and running diagonally up and
 * across, deepest at the corner and thinning as it goes, with a weaker echo at
 * the bottom right so the screen is not lopsided.
 *
 * ⚠️ Every radial is centred BELOW the viewport, so only the flat top of each
 * falloff is on screen. That is what keeps it a wave rather than a spotlight: a
 * visible dome under the console would read as a stage.
 *
 * 🔴 `fixed`, and behind everything. The console frame is opaque, so this shows
 * only in the 6px gutter around and between the panels. That is the intent: the
 * ground is glimpsed at the edges, never read through the work.
 */

export function ConsoleGlow() {
	/**
	 * 🔑 The wave lives in CSS, not in a style object here.
	 *
	 * It has to differ between themes, and an inline `backgroundImage` cannot:
	 * a light ground needs paler water and no black veil at the top, because
	 * the veil that gives a dark console depth is just a dirty band on a light
	 * one. Both palettes sit in `styles.css` under `.console-glow`.
	 */
	return (
		<div aria-hidden="true" className="console-glow">
			{/* Three soft masses low on the screen, drifting on unrelated periods so
			    the light at the bottom is never quite the same twice. */}
			<div className="console-clouds">
				<span className="console-cloud" />
				<span className="console-cloud" />
				<span className="console-cloud" />
			</div>
		</div>
	);
}
