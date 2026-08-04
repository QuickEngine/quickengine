#!/usr/bin/env node
// Every test suite must own its database.
//
// 🔴 This exists because `packages/modules/content` was created by copying
// `packages/modules/payments`, and its `TEST_DB_NAME` was never changed. Turbo
// runs packages in PARALLEL, so two suites then provisioned and truncated the
// same database at the same time. The symptoms were:
//
//   · `relation "quickengine_accounts" already exists` — both suites racing to
//     apply migration 0000 to a database neither had finished creating
//   · `WORKSPACE_NOT_FOUND` on a row a `beforeEach` had just inserted — the
//     other suite's `truncateAll()` landing between the insert and the test
//
// Both read as flaky. Neither was. A copied config is easy to make and
// impossible to spot in review, so the check belongs in CI.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = execSync("git rev-parse --show-toplevel", {
	encoding: "utf8",
}).trim();

const configs = execSync(
	"find packages services -name vitest.config.ts -not -path '*/node_modules/*'",
	{ cwd: ROOT, encoding: "utf8" },
)
	.trim()
	.split("\n")
	.filter(Boolean);

/** package path → database name, for the suites that use a database at all. */
const owners = new Map();
const problems = [];

for (const config of configs) {
	const text = readFileSync(`${ROOT}/${config}`, "utf8");
	const names = [
		...new Set(
			[...text.matchAll(/TEST_DB_NAME\s*[:=]\s*"([^"]+)"/g)].map((m) => m[1]),
		),
	];
	if (names.length === 0) continue;

	const pkg = config.replace(/\/vitest\.config\.ts$/, "");

	// A config naming two different databases is its own bug: whichever runs
	// second silently wins and the suite tests against the wrong schema.
	if (names.length > 1) {
		problems.push(
			`${pkg} declares more than one TEST_DB_NAME: ${names.join(", ")}`,
		);
		continue;
	}

	const [name] = names;
	const existing = owners.get(name);
	if (existing) {
		problems.push(
			`${pkg} and ${existing} both use "${name}" — they run in parallel and will truncate each other`,
		);
	} else {
		owners.set(name, pkg);
	}
}

if (problems.length > 0) {
	console.error("\nTest database check failed:\n");
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(
		"\nGive each suite its own TEST_DB_NAME. Copying a vitest.config.ts without\n" +
			"changing it makes two suites share one database, which reads as flaky tests.\n",
	);
	process.exit(1);
}

console.log(
	`Test database check passed: ${owners.size} suites, each with its own database.`,
);
