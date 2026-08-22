#!/usr/bin/env node
/**
 * Every read of an environment-scoped table must say which environment.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Test and live money live in the SAME tables, separated only by an
 * `environment` column. A query that forgets to filter does not fail — it
 * silently returns both, and the failure surfaces as a sandbox order in a real
 * revenue figure, or a real order hidden behind a test-mode toggle.
 *
 * Nothing caught this class. `STATE.md` has recorded "~29 order queries still do
 * not filter by mode" since 2026-08-18, and the notifications table shipped with
 * no environment column at all — a sandbox "New order" and a real one were
 * identical in the bell.
 *
 * ⚠️ A HEURISTIC, and it says so. It looks for reads of the tables below and
 * checks the surrounding call for an environment predicate. It will miss a
 * query built dynamically, and it will flag one that is legitimately
 * environment-wide. The allowlist is for the second case and every entry needs a
 * reason — a growing allowlist with no reasons is how a guard becomes a
 * formality.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Tables whose rows belong to exactly one environment. */
const SCOPED = [
	"orders",
	"payments",
	"paymentRefunds",
	"paymentAccounts",
	"subscriptions",
	"notifications",
];

/**
 * Reads that are deliberately environment-wide, each with the reason.
 *
 * 🔴 A file lands here only when reading across both modes is CORRECT, not when
 * fixing it is inconvenient.
 */
const ALLOWED = new Map([
	[
		"packages/db/src/notifications.ts",
		"The filter itself lives here; callers pass the environment in.",
	],
	[
		"packages/modules/orders/src/subscriptions.ts",
		"dueSubscriptions runs as a cron across every workspace and mode; the order it creates inherits the subscription's own environment.",
	],
	[
		"packages/db/src/workspace-branding.ts",
		"Branding is per workspace, not per mode.",
	],
	[
		"packages/modules/payments/src/payments.ts",
		"invoiceCollectedCents and the refund read are scoped to one invoice or one payment id, which already pins the mode; listPayments filters explicitly.",
	],
]);

const ROOTS = ["packages", "services", "apps"];
const problems = [];

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
			continue;
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path);
		else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
			inspect(path);
	}
}

function inspect(path) {
	const relative = path.replace(`${process.cwd()}/`, "");
	if (ALLOWED.has(relative)) return;
	const source = readFileSync(path, "utf8");

	for (const table of SCOPED) {
		// `.from(orders)` — a read. Writes are `insert(...)` and carry the column.
		const pattern = new RegExp(`\\.from\\(\\s*${table}\\s*\\)`, "g");
		let match = pattern.exec(source);
		while (match) {
			// The predicate usually follows within the same chained call.
			const window = source.slice(match.index, match.index + 900);
			const filtered =
				/environment/.test(window) ||
				// A read of ONE row by primary key is already unambiguous.
				/\.id\s*,/.test(window) ||
				/eq\(\s*\w+\.id\s*,/.test(window);
			if (!filtered) {
				const line = source.slice(0, match.index).split("\n").length;
				problems.push(
					`${relative}:${line} reads ${table} without an environment filter`,
				);
			}
			match = pattern.exec(source);
		}
	}
}

for (const root of ROOTS) walk(join(process.cwd(), root));

if (problems.length > 0) {
	console.error(
		`Environment isolation: ${problems.length} read(s) may cross test and live.\n`,
	);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(
		"\nEither filter by environment, or add the file to ALLOWED in this script WITH a reason.",
	);
	process.exit(1);
}

console.log(
	`Environment isolation: every read of ${SCOPED.length} scoped tables filters by mode, or is allowlisted with a reason.`,
);
