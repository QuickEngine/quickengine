import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generate `robots.txt` and `sitemap.xml` into `public/` at build time.
 *
 * Next produced these from `app/robots.ts` and `app/sitemap.ts` at request time.
 * A static SPA has no request-time hook, so they are generated **before** the
 * bundle instead — same output, no framework required.
 *
 * The sitemap still walks the route tree rather than listing pages by hand, which
 * is the part worth preserving: a new marketing page can never be silently left
 * out of search indexing because somebody forgot to add it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SITE_URL = process.env.SITE_URL ?? "https://quickengine.xyz";

// Dynamic-route slugs, which the file tree cannot enumerate on its own.
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

/** Every static route, derived from `src/routes`. */
function staticRoutes() {
	const routes = [];
	const walk = (dir, segments) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const name = entry.name;
			if (entry.isDirectory()) {
				walk(join(dir, name), [...segments, name]);
				continue;
			}
			if (!name.endsWith(".tsx")) continue;
			// `__root` is the layout, `$param` routes are enumerated explicitly.
			if (name.startsWith("__") || name.includes("$")) continue;
			const base = name.replace(/\.tsx$/, "");
			routes.push(
				base === "index"
					? `/${segments.join("/")}`
					: `/${[...segments, base].join("/")}`,
			);
		}
	};
	walk(join(root, "src/routes"), []);
	return routes.map((r) => (r === "/" ? "/" : r.replace(/\/+$/, "")));
}

const modules = readdirSync(join(root, "src/lib")).includes("modules.ts")
	? ((
			await import(join(root, "src/lib/modules.ts").replace(/\\/g, "/")).catch(
				() => ({ MODULES: [] }),
			)
		).MODULES ?? [])
	: [];

const paths = new Set([
	...staticRoutes(),
	...modules.map((m) => `/products/modules/${m.slug}`),
	...BUSINESS_TYPES.map((t) => `/business/${t}`),
	...DOC_SECTIONS.map((s) => `/docs/${s}`),
]);

const lastModified = new Date().toISOString();
const urls = [...paths]
	.sort()
	.map((path) => {
		const depth = path === "/" ? 0 : path.split("/").length - 1;
		const priority = path === "/" ? 1 : Math.max(0.4, 0.9 - depth * 0.15);
		return `\t<url>
\t\t<loc>${new URL(path, SITE_URL).toString()}</loc>
\t\t<lastmod>${lastModified}</lastmod>
\t\t<changefreq>${path === "/" ? "weekly" : "monthly"}</changefreq>
\t\t<priority>${priority.toFixed(1)}</priority>
\t</url>`;
	})
	.join("\n");

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(
	join(root, "public/sitemap.xml"),
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
writeFileSync(
	join(root, "public/robots.txt"),
	`User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", SITE_URL).toString()}\nHost: ${SITE_URL}\n`,
);

console.log(`✓ robots.txt and sitemap.xml (${paths.size} URLs)`);
