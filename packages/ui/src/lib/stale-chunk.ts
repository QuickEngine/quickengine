/**
 * Recovery from the chunk that stopped existing.
 *
 * Shared, because every Vite app here is code-split and every one of them has
 * this bug. It lived in the marketing app until 2026-08-10 and auth needed the
 * identical thing — copying it would have meant two cooldown windows and two
 * lists of browser error strings drifting apart.
 *
 * Imported as `@quickengine/ui/lib/stale-chunk`. No React, no DOM beyond
 * `window`, nothing that makes it a UI concern; it lives here because this is
 * the package every app already depends on.
 *
 * 🔴 This is a real defect, not polish. Every route is code-split, and the file
 * names carry a content hash. Deploying replaces them. So a tab left open across
 * a deploy is holding a route table that points at `about-DJBDsWHE.js` while the
 * server now only has `about-Mj3cra_V.js` — and the moment that visitor clicks a
 * link they have never visited, the dynamic import 404s.
 *
 * Before this, that landed on the 500 page: "something went wrong on our end",
 * with a Try again that re-ran the same failed import and failed identically.
 * The visitor's only way out was a manual reload, which is the one thing the
 * screen did not suggest.
 *
 * It is also invisible in development, where chunks are served unhashed and
 * nothing is ever replaced underneath you. It only ever appears in production,
 * only after a deploy, and only to people who were already on the site — which
 * is to say, to the users who come back most.
 */

/**
 * ⚠️ Matched on the MESSAGE, because there is no error type to check.
 *
 * A failed dynamic import surfaces as a plain `TypeError` whose text is written
 * by the browser, and each engine words it differently. All three strings below
 * are real: Chromium, Firefox and Safari respectively. There is no shared code,
 * no `name` to switch on and no property that distinguishes it — matching text
 * is genuinely the only option, which is why they are listed explicitly rather
 * than hidden behind one loose pattern.
 */
const STALE_CHUNK = [
	"failed to fetch dynamically imported module",
	"error loading dynamically imported module",
	"importing a module script failed",
];

export function isStaleChunkError(error: unknown): boolean {
	const message = (
		error instanceof Error ? error.message : String(error ?? "")
	).toLowerCase();
	return STALE_CHUNK.some((fragment) => message.includes(fragment));
}

const KEY = "qe:chunk-reload-at";

/**
 * How long to wait before a second attempt is allowed.
 *
 * ⚠️ A cooldown, deliberately, and NOT a one-shot flag. A flag that is set
 * forever means the second deploy a visitor sits through is unrecoverable,
 * because the app already used its one reload hours earlier. A timestamp both
 * stops the reload loop — which is the failure mode that matters, since an
 * unfixable import would otherwise refresh the page forever — and lets a genuine
 * second occurrence recover normally.
 */
const COOLDOWN_MS = 10_000;

/**
 * Reload once to pick up the new build.
 *
 * Returns whether a reload was actually started. `false` means one was attempted
 * moments ago and did not fix it, so the caller should show a real error rather
 * than trying again.
 */
export function recoverFromStaleChunk(): boolean {
	try {
		const last = Number(sessionStorage.getItem(KEY) ?? 0);
		if (Date.now() - last < COOLDOWN_MS) return false;
		sessionStorage.setItem(KEY, String(Date.now()));
	} catch {
		// Private mode and blocked storage both throw here. Losing the loop guard
		// is worse than losing the recovery, so this gives up rather than reloading
		// without one.
		return false;
	}
	window.location.reload();
	return true;
}
