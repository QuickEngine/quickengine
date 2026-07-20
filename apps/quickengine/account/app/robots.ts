import type { MetadataRoute } from "next";

// Nothing on this surface should ever be indexed: it is an authenticated application,
// not content. Note robots.txt is advisory only — actual protection is the auth gate.
export default function robots(): MetadataRoute.Robots {
	return { rules: [{ userAgent: "*", disallow: "/" }] };
}
