/**
 * The two brand fills, shared so they cannot drift.
 *
 * They lived only in the web app's `pill.tsx` until the auth screens needed the
 * same buttons. Two copies of a hex value is how a palette quietly diverges —
 * one gets tuned, the other does not, and the two surfaces stop matching without
 * anyone changing anything.
 *
 * Literal hex rather than theme tokens on purpose, for now: they are being
 * chosen by eye, and routing them through the ramp would mean every adjustment
 * moves the rest of the palette with it. They become tokens once they settle.
 */
export const ICE = "#DCE7ED";

/**
 * The secondary fill. It was #959595 and sat too light — against black it read
 * as loud as the primary, so the pair had no order to it. This is dark enough to
 * recede and carries a little blue so both buttons belong to the same page. Ice
 * text on it is 7.8:1, past AAA.
 */
export const GREY = "#3C4247";

/**
 * Failure. The only colour here that is not one of the two brand fills.
 *
 * ⚠️ A deliberate exception to the palette rule, and the reasoning matters
 * because it does NOT generalise. The connection banner was pulled back onto ICE
 * and GREY precisely because a status message does not need to be distinguished
 * from the primary action — it is not competing with it. An inline error IS: it
 * sits directly above the button the person is about to press again, and if it
 * shares that button's colour it reads as part of the control rather than as the
 * reason the control failed.
 *
 * Muted rose, not alarm red. It sits in the same lightness band as ICE so it
 * belongs to this site, and `text-red-300`/`text-red-400` — which is what every
 * auth screen used before — did not.
 */
export const ALERT = "#E8B4B4";
