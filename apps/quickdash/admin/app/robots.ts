import type { MetadataRoute } from "next";

// The dashboard is an authenticated application and must not be indexed. /agents.txt is
// the deliberate exception — it is a public, machine-readable integration guide meant to
// be fetched by a user's AI coding agent. Note robots.txt is advisory only; the real
// protection is the auth gate.
export default function robots(): MetadataRoute.Robots {
	return {
		rules: [{ userAgent: "*", allow: "/agents.txt", disallow: "/" }],
	};
}
