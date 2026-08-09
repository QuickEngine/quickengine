import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
		...options,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
	);
	return result.stdout;
};

test("Quick.js packs both module formats, declarations, and no source", async () => {
	run("pnpm", ["--filter", "@quickengine/quick", "build"]);
	const installRoot = mkdtempSync(join(tmpdir(), "quick-package-contract-"));
	const packed = JSON.parse(
		run("pnpm", ["pack", "--json", "--pack-destination", installRoot], {
			cwd: "packages/sdk",
		}),
	);
	const files = new Set(packed.files.map(({ path }) => path));

	for (const required of [
		"README.md",
		"package.json",
		"dist/index.js",
		"dist/index.cjs",
		"dist/index.d.ts",
		"dist/index.d.cts",
		"dist/browser.js",
		"dist/browser.cjs",
		"dist/browser.d.ts",
		"dist/browser.d.cts",
	]) {
		assert.ok(files.has(required), `packed SDK is missing ${required}`);
	}
	for (const path of files) {
		assert.doesNotMatch(
			path,
			/(^|\/)src\//,
			`source leaked into package: ${path}`,
		);
		assert.doesNotMatch(
			path,
			/\.map$/,
			`source map leaked into package: ${path}`,
		);
	}

	const esm = await import(
		pathToFileURL(`${process.cwd()}/packages/sdk/dist/index.js`).href
	);
	const browser = await import(
		pathToFileURL(`${process.cwd()}/packages/sdk/dist/browser.js`).href
	);
	const require = createRequire(import.meta.url);
	const cjs = require(`${process.cwd()}/packages/sdk/dist/index.cjs`);

	for (const module of [esm, cjs]) {
		assert.equal(typeof module.createQuickServer, "function");
		assert.equal(typeof module.QuickApiError, "function");
	}
	assert.equal(typeof browser.createQuickConnect, "function");
	assert.equal("verifyQuickWebhookSignature" in browser, false);

	// Install only the tarball into an empty directory. This catches exports that
	// accidentally work through workspace source or hoisted dependencies.
	run(
		"npm",
		["install", packed.filename, "--ignore-scripts", "--no-audit", "--no-fund"],
		{
			cwd: installRoot,
			env: {
				...process.env,
				npm_config_cache: join(installRoot, ".npm-cache"),
			},
		},
	);
	run(
		"node",
		[
			"--input-type=module",
			"--eval",
			'import { createQuickServer } from "@quickengine/quick"; import { createQuickConnect } from "@quickengine/quick/browser"; if (typeof createQuickServer !== "function" || typeof createQuickConnect !== "function") process.exit(1)',
		],
		{ cwd: installRoot },
	);
	run(
		"node",
		[
			"--input-type=commonjs",
			"--eval",
			'if (typeof require("@quickengine/quick").createQuickServer !== "function") process.exit(1)',
		],
		{ cwd: installRoot },
	);
});

test("CLI and generated projects use the final API origin", async () => {
	const paths = [
		"packages/cli/README.md",
		"packages/cli/src/commands/config.ts",
		"packages/cli/src/commands/create.ts",
		"packages/cli/src/commands/init.ts",
		"packages/cli/src/defaults.ts",
		"packages/cli/src/scaffold.ts",
	];
	const source = (
		await Promise.all(paths.map((path) => readFile(path, "utf8")))
	).join("\n");
	assert.match(source, /https:\/\/api\.quickdash\.xyz/);
	assert.doesNotMatch(source, /https:\/\/(api|dash)\.quickengine\.xyz/);
});
