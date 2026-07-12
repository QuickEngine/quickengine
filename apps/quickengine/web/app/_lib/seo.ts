import { clientEnv } from "@quickengine/env/client";
import type { Metadata } from "next";

// Single source of truth for site-wide SEO. The OG image lives in /public and is
// shared by every page via metadata inheritance — set it once here, never per
// page, so it can't drift. Per-page files only pass title/description/path.

export const SITE_NAME = "QuickEngine";
export const SITE_URL = clientEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL;
export const SITE_TAGLINE = "Build more. Switch less.";
export const SITE_DESCRIPTION =
	"QuickEngine is the headless backend your whole business runs on — one platform, configured per workspace, so you build more and switch less.";

// One 1200x630 image (public/og-image.png) for every share card, no drift.
export const OG_IMAGE = {
	url: "/og-image.png",
	width: 1200,
	height: 630,
	alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

// X/Twitter's large card uses a 16:9 crop, so it gets its own 1200x675 image.
// Still one file for the whole site — set here, inherited everywhere.
export const TWITTER_IMAGE = {
	url: "/twitter-image.png",
	width: 1200,
	height: 675,
	alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

// Public profiles, mirrored from the footer. Feeds the Organization schema's
// `sameAs`, which helps search engines link the brand to its social presence.
export const SOCIAL_LINKS = [
	"https://x.com/QuickEngineSW",
	"https://youtube.com/@QuickEngineSoftware",
	"https://www.linkedin.com/in/quickengine-software-a98a3741b/",
	"https://github.com/QuickEngine",
	"https://www.instagram.com/quickengine",
	"https://www.tiktok.com/@quickenginesoftware",
	"https://www.producthunt.com/@quickengine",
	"https://discord.gg/quickengine",
];

// JSON-LD structured data for the whole site (rendered once in the root layout).
// The @graph lets us ship the Organization and WebSite nodes in one script tag.
export function siteJsonLd() {
	const absolute = (path: string) => new URL(path, SITE_URL).toString();
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "Organization",
				"@id": `${SITE_URL}#organization`,
				name: SITE_NAME,
				legalName: "QuickEngine Software",
				url: SITE_URL,
				logo: absolute("/logo.svg"),
				description: SITE_DESCRIPTION,
				sameAs: SOCIAL_LINKS,
			},
			{
				"@type": "WebSite",
				"@id": `${SITE_URL}#website`,
				name: SITE_NAME,
				url: SITE_URL,
				publisher: { "@id": `${SITE_URL}#organization` },
			},
		],
	};
}

type BuildMetadataArgs = {
	/** Page title; the layout template appends " | QuickEngine". */
	title?: string;
	/** Meta + OG description. Falls back to the site description. */
	description?: string;
	/** Canonical path, e.g. "/pricing". Resolves against metadataBase. */
	path?: string;
};

/**
 * Builds a page's Metadata with a matching canonical, Open Graph, and Twitter
 * card. The shared OG image is always attached. Use in any page:
 *   export const metadata = buildMetadata({ title: "Pricing", path: "/pricing" });
 */
export function buildMetadata({
	title,
	description,
	path = "/",
}: BuildMetadataArgs = {}): Metadata {
	const desc = description ?? SITE_DESCRIPTION;
	return {
		title,
		description: desc,
		alternates: { canonical: path },
		openGraph: {
			...(title ? { title } : {}),
			description: desc,
			url: path,
			siteName: SITE_NAME,
			type: "website",
			locale: "en_US",
			images: [OG_IMAGE],
		},
		twitter: {
			...(title ? { title } : {}),
			description: desc,
			card: "summary_large_image",
			images: [TWITTER_IMAGE.url],
		},
	};
}
