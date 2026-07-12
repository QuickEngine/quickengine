import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/seo";

// Lets every crawler index the marketing site, keeps them out of API routes,
// and points them at the sitemap. Next serves this at /robots.txt.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
		sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
		host: SITE_URL,
	};
}
