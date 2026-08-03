import { env } from "./env";

/**
 * Site-wide constants used by the app itself — the footer, the tab title, and
 * whatever else needs the brand strings in one place.
 *
 * **This file no longer produces metadata.** It used to export `buildMetadata()`,
 * which returned a Next.js `Metadata` object (`alternates.canonical`,
 * `openGraph`, `twitter`). That shape is only ever read by Next's
 * `export const metadata`, so after the Vite migration nothing consumed it and
 * the site shipped with no Open Graph tags at all — every link shared anywhere
 * rendered with no image and a generic title.
 *
 * The real tags are static in `index.html`, because crawlers and link unfurlers
 * do not run JavaScript. Read the comment there before adding metadata here.
 */

export const SITE_NAME = "QuickEngine";
export const SITE_URL = env.VITE_WEB_URL;
export const SITE_TAGLINE = "Build more. Switch less.";
export const SITE_DESCRIPTION =
	"QuickEngine is the headless backend your whole business runs on — one platform, configured per workspace, so you build more and switch less.";

/**
 * Share cards, named once with their sizes recorded beside them. `index.html`
 * references them by absolute URL; these entries are what the prerenderer reads
 * when per-page cards land.
 *
 * The `-x` variants are composed for X's 16:9 large card rather than letting the
 * 1.91:1 asset be cropped.
 */
export const OG_IMAGES = {
	default: { url: "/og/default.png", width: 1200, height: 630 },
	defaultX: { url: "/og/default-x.png", width: 1200, height: 675 },
	quickdash: { url: "/og/quickdash.png", width: 1200, height: 630 },
	quickdashX: { url: "/og/quickdash-x.png", width: 1200, height: 675 },
} as const;

export const OG_IMAGE_ALT =
	"QuickEngine — building the operating system for modern businesses.";

/**
 * Public profiles, mirrored in the footer.
 *
 * ⚠️ Also hardcoded as `sameAs` in the JSON-LD block in `index.html` — static
 * HTML cannot import from here. Change one, change both. Prerendering removes
 * the duplication.
 */
export const SOCIAL_LINKS = [
	"https://x.com/QuickEngineSW",
	"https://youtube.com/@QuickEngineSoftware",
	"https://www.linkedin.com/in/quickengine-software-a98a3741b/",
	"https://github.com/QuickEngine",
	"https://www.instagram.com/quickengine",
	"https://www.tiktok.com/@quickenginesoftware",
	"https://www.producthunt.com/@quickengine",
	"https://discord.gg/quickengine",
] as const;

/**
 * The browser tab title for a route — `Pricing / QuickEngine`. This is the one
 * piece of head content that genuinely belongs at runtime: it changes on
 * client-side navigation, and no crawler depends on it.
 *
 *   head: () => ({ meta: [{ title: pageTitle("Pricing") }] })
 *
 * The bare brand is the fallback for a route that sets no title, so a tab can
 * never read `undefined / QuickEngine`.
 */
export function pageTitle(title?: string) {
	return title ? `${title} / ${SITE_NAME}` : SITE_NAME;
}
