#!/usr/bin/env node
// Every business failure a module raises must reach the HTTP boundary as a DomainError with a
// human-readable message. Two ways that silently breaks:
//
//   1. The code isn't in the module's FRIENDLY map, so the raw enum string ("QUOTE_TAX_INVALID")
//      becomes the message a customer reads.
//   2. The code matches none of the mapper's regexes, so `mapXError` rethrows the bare Error and
//      the app's onError turns an ordinary business conflict into HTTP 500 INTERNAL_ERROR.
//
// Both shipped in 8E/8F and went unnoticed because nothing compared the thrown codes against the
// map. This check does, so a new code can't be added without being classified.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MODULES_DIR = "packages/modules";

/** Regex literals used in `.test(...)` calls, however they're written across lines. */
const mapperRegexes = (body) =>
	[...body.matchAll(/\/((?:[^/\\\n]|\\.)+)\/\.test/g)].map((m) =>
		m[1].replace(/[\n\t]/g, ""),
	);

export function auditErrorMaps(root = process.cwd()) {
	const problems = [];
	const audited = [];
	const modulesPath = path.join(root, MODULES_DIR);

	for (const moduleName of readdirSync(modulesPath).sort()) {
		const src = path.join(modulesPath, moduleName, "src");
		const appPath = path.join(src, "application.ts");
		if (!existsSync(appPath)) continue;
		const app = readFileSync(appPath, "utf8");

		const mapper = app.match(
			/function map\w+Error\(error: unknown\): never \{([\s\S]*?)\n\}/,
		);
		// A module may legitimately throw DomainError inline instead of mapping bare Errors.
		if (!mapper) continue;
		const regexes = mapperRegexes(mapper[1]);

		const friendlyBlock = app.match(/const FRIENDLY[^{]*\{([\s\S]*?)\n\};/);
		const mapped = new Set(
			friendlyBlock
				? [...friendlyBlock[1].matchAll(/^\t([A-Z_]+):/gm)].map((m) => m[1])
				: [],
		);

		const thrown = new Set();
		for (const file of readdirSync(src)) {
			if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
			const contents = readFileSync(path.join(src, file), "utf8");
			for (const m of contents.matchAll(/throw new Error\("([A-Z_]+)"/g)) {
				thrown.add(m[1]);
			}
		}

		audited.push(moduleName);
		for (const code of [...thrown].sort()) {
			if (!mapped.has(code)) {
				problems.push(
					`${moduleName}: ${code} has no FRIENDLY message (the raw code would be shown to a customer)`,
				);
			}
			// A *_NOT_FOUND suffix is handled by the mapper's dedicated branch.
			if (code.endsWith("NOT_FOUND")) continue;
			if (!regexes.some((rx) => new RegExp(rx).test(code))) {
				problems.push(
					`${moduleName}: ${code} matches no mapper branch (it would surface as HTTP 500)`,
				);
			}
		}
	}
	return { audited, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { audited, problems } = auditErrorMaps();
	if (problems.length) {
		console.error("Error-map check failed:");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}
	console.log(
		`Error-map check passed: ${audited.length} module mappers classify every code they throw.`,
	);
}
