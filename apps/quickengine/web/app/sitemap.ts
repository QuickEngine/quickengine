import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/seo";
import { MODULES } from "./products/modules/_modules";

// Dynamic-route slugs — mirror generateStaticParams in each [param] route.
const BUSINESS_TYPES = [
	"ecommerce",
	"agencies",
	"freelancers",
	"saas",
	"enterprise",
	"startups",
	"migrations",
];
const DOC_SECTIONS = ["quickstarts", "api", "sdks", "cli", "examples"];

// Walk app/ for static routes (any dir with a page file), skipping private
// (_x), route groups ((x)), dynamic ([x]), and api dirs. Dynamic routes are
// added explicitly below. This keeps the sitemap in sync with the file tree so
// a new marketing page can never be silently left out of search indexing.
function staticRoutes(): string[] {
	const routes: string[] = [];
	const walk = (dir: string, segments: string[]) => {
		const entries = readdirSync(dir, { withFileTypes: true });
		if (
			entries.some(
				(e) => e.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name),
			)
		) {
			routes.push(`/${segments.join("/")}`);
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const name = entry.name;
			if (
				name.startsWith("_") ||
				name.startsWith("(") ||
				name.startsWith("[") ||
				name === "api"
			) {
				continue;
			}
			walk(join(dir, name), [...segments, name]);
		}
	};
	walk(join(process.cwd(), "app"), []);
	return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
	const lastModified = new Date();
	const paths = new Set<string>([
		...staticRoutes(),
		...MODULES.map((m) => `/products/modules/${m.slug}`),
		...BUSINESS_TYPES.map((t) => `/business/${t}`),
		...DOC_SECTIONS.map((s) => `/docs/${s}`),
	]);

	return Array.from(paths).map((path) => {
		const depth = path === "/" ? 0 : path.split("/").length - 1;
		return {
			url: new URL(path, SITE_URL).toString(),
			lastModified,
			changeFrequency: path === "/" ? "weekly" : "monthly",
			priority: path === "/" ? 1 : Math.max(0.4, 0.9 - depth * 0.15),
		};
	});
}
