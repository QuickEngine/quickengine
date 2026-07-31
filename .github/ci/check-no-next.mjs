// Fails if Next.js re-enters the product.
//
// This replaces `check-next-boundaries.mjs`, deleted 2026-07-31 for counting the
// wrong thing: it tallied Next *files* and reported a clean `0 server-action
// files and 0 route handlers` for weeks while `better-auth/next-js` threw
// `TypeError: cookies is not a function` at every session refresh in production.
//
// The exposure is real and permanent: `next` remains installed as an
// auto-installed optional peer of `better-auth`, so a Next import still RESOLVES
// locally, passes typecheck, passes tests, and fails only in production. This
// check is the thing standing between that and a repeat.
//
// Deliberately matches import syntax rather than any mention of "next", so prose
// explaining why Next was removed does not trip it.
import { globSync, readFileSync } from "node:fs";

const SOURCE = "{apps,packages,services}/**/*.{ts,tsx,mjs,js}";
const MANIFESTS = "{apps,packages,services}/**/package.json";
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.turbo/**"];

// `next-themes` is a standalone React package with no Next dependency; the
// trailing `/` and the closing quote keep it out of these patterns.
const IMPORT_PATTERNS = [
	/from\s+["']next\//,
	/from\s+["']next["']/,
	/require\(\s*["']next\//,
	/require\(\s*["']next["']/,
	/["']better-auth\/next-js["']/,
];

const failures = [];

for (const file of globSync(SOURCE, { exclude: IGNORE })) {
	const lines = readFileSync(file, "utf8").split("\n");
	lines.forEach((line, i) => {
		if (IMPORT_PATTERNS.some((p) => p.test(line))) {
			failures.push(`${file}:${i + 1}  ${line.trim()}`);
		}
	});
}

for (const file of globSync(MANIFESTS, { exclude: IGNORE })) {
	const pkg = JSON.parse(readFileSync(file, "utf8"));
	for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
		if (pkg[field]?.next) {
			failures.push(`${file}  declares "next" in ${field}`);
		}
	}
}

if (failures.length > 0) {
	console.error(
		`Next.js check FAILED — ${failures.length} reference(s) found.\n` +
			"Next was removed from this product on 2026-07-31. It still resolves\n" +
			"locally as a peer of better-auth, so this would break only in production.\n",
	);
	for (const f of failures) console.error(`  ${f}`);
	process.exit(1);
}

console.log("Next.js check passed: no Next imports or dependencies.");
