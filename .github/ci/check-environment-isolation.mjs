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

/**
 * Helpers that exist to apply the workspace mode, and are trusted to.
 *
 * ⚠️ Each one must apply BOTH the workspace and the environment, and must be
 * short enough to check by eye. This list is the guard's blind spot, so it stays
 * tiny — a helper here is a promise nothing verifies.
 */
const SCOPING_HELPERS = ["inCurrentMode("];

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

/**
 * Where the function containing `index` begins.
 *
 * 🔴 Bounding both windows to ONE function is the whole correctness of this
 * guard. Its first version looked a fixed 900 characters forward and found a
 * filter belonging to the next function down; looking backwards without a bound
 * would make the same mistake in the other direction.
 */
function functionStart(source, index) {
	const before = source.slice(0, index);
	let best = 0;
	for (const marker of ["\nexport ", "\nasync function ", "\nfunction "]) {
		const at = before.lastIndexOf(marker);
		if (at > best) best = at;
	}
	return best;
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
			/**
			 * The rest of THIS statement, and nothing after it.
			 *
			 * ⚠️ This was a fixed 900 characters, which ran straight past the end of
			 * the query into whatever came next. An unfiltered `listPayments` was
			 * excused by an `eq(payments.id, id)` belonging to the `getPaymentDto`
			 * defined below it — a filter in a different function entirely.
			 */
			const terminator = source.indexOf(";", match.index);
			const statement = source.slice(
				match.index,
				terminator === -1 ? match.index + 900 : terminator,
			);
			/**
			 * The function so far, because a filter is often built ABOVE the query.
			 *
			 * `listOrdersPage` assembles its predicate into a `where` constant and
			 * then passes the name — so the statement itself contains no filter at
			 * all, and reading only forward calls a correctly scoped query a leak.
			 */
			const preceding = source.slice(
				functionStart(source, match.index),
				match.index,
			);
			const region = `${preceding}${statement}`;

			const filtered =
				/**
				 * The column in PREDICATE position, on THIS table.
				 *
				 * ⚠️ Not merely a mention of it. `listOrganizationSettlements` selects
				 * `environment: payments.environment` so the operator can see which
				 * mode each row is — displaying the column, filtering by nothing. A
				 * looser test read that as scoped and cleared a genuinely cross-mode
				 * list.
				 */
				new RegExp(
					`(eq|ne|inArray|notInArray)\\(\\s*${table}\\.environment`,
				).test(region) ||
				// The same predicate written in raw sql, as the money aggregates are.
				new RegExp(`\\$\\{${table}\\.environment\\}\\s*(=|in)`).test(region) ||
				// One row of THIS table, by primary key, is already unambiguous.
				new RegExp(`eq\\(\\s*${table}\\.id\\s*,`).test(region) ||
				// A named helper whose whole job is applying the mode.
				SCOPING_HELPERS.some((helper) => region.includes(helper));

			/**
			 * A deliberate cross-mode read, marked where it happens.
			 *
			 * The file-level allowlist is too blunt for a file that has both kinds:
			 * allowlisting `organization-revenue.ts` for its two mode-labelled lists
			 * would also excuse its revenue total, which must stay pinned to `live`.
			 */
			const declared = /environment-unfiltered:/.test(
				// From ABOVE the function, because that is where its doc comment is —
				// the marker belongs in the comment explaining the function, not
				// buried in its body.
				source.slice(
					Math.max(0, functionStart(source, match.index) - 1200),
					match.index,
				),
			);

			if (!filtered && !declared) {
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
