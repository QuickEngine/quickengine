#!/usr/bin/env node
/**
 * Brand asset sync — run `pnpm brand:sync` after replacing a logo file.
 *
 * `apps/quickengine/web/public` is the source of truth for `logo.svg` and
 * `wordmark.svg`. This copies both to every other app and regenerates the React
 * components that inline them.
 *
 * The components exist (rather than an <img>) so the marks inherit `currentColor`
 * and adapt to the theme, with no flash while a file loads. The cost is that they
 * duplicate the SVG — which is exactly what this script keeps honest.
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = `${root}/apps/quickengine/web/public`;
const targets = [
	"apps/quickengine/auth/public",
	"apps/quickengine/account/public",
	"apps/quickdash/web/public",
];

/** One entry per brand file that has a matching component. */
const assets = [
	{
		file: "logo.svg",
		component: "packages/ui/src/components/logo.tsx",
		name: "Logo",
		notes: [
			"QuickEngine brand mark. Colored via currentColor so it adapts to the surface —",
			"set the color with a text-* class (dark on light, light on dark). Size it with",
			"a className (e.g. size-7).",
		],
	},
	{
		file: "wordmark.svg",
		component: "packages/ui/src/components/wordmark.tsx",
		name: "Wordmark",
		notes: [
			"QuickEngine mark + name lockup. Same colour rules as <Logo>. Size it by HEIGHT",
			"only — `h-7 w-auto` — because the viewBox is several times wider than it is",
			"tall, so sizing by width makes it tower over everything next to it. h-7 matches",
			'<Logo className="size-7">: the mark fills the lockup\'s full height, so both',
			"render the mark at the same scale.",
		],
	},
];

for (const asset of assets) {
	const svg = readFileSync(`${source}/${asset.file}`, "utf8");
	const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
	const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
	if (!viewBox || paths.length === 0) {
		throw new Error(`${asset.file}: expected a viewBox and at least one path`);
	}

	for (const target of targets) {
		copyFileSync(`${source}/${asset.file}`, `${root}/${target}/${asset.file}`);
	}

	const header = asset.notes.map((line) => `// ${line}`).join("\n");
	const body = paths.map((d) => `\t\t\t\t<path d="${d}" />`).join("\n");
	writeFileSync(
		`${root}/${asset.component}`,
		`import type { SVGProps } from "react";

${header}
//
// GENERATED from \`public/${asset.file}\` by \`pnpm brand:sync\`. Edit the SVG, not this file.
export function ${asset.name}(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="${viewBox}"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="QuickEngine"
			{...props}
		>
			<title>QuickEngine</title>
			<g fill="currentColor">
${body}
			</g>
		</svg>
	);
}
`,
	);
	console.log(
		`${asset.file}: ${paths.length} paths → ${asset.name}, copied to ${targets.length} apps`,
	);
}
