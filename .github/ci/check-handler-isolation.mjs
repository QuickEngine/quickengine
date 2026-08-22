#!/usr/bin/env node
/**
 * Every read in a file that runs WITHOUT a session must name its workspace.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 `services/api/src/tenant-isolation.test.ts` drives all ~339 HTTP routes
 * with a valid session that belongs to no workspace, and fails the build if any
 * of them answers with data. That is the strongest isolation control in the
 * system, and it covers exactly one half of the code.
 *
 * The other half is this one: outbox handlers, cron jobs and provider webhooks.
 * They run with **no session at all**. They are handed a workspace and a
 * payload, and a payload is data — an id inside it is a claim, not a fact.
 * A handler that looks a record up by id alone has no session for anything to
 * refuse, and nothing above it will notice.
 *
 * An external audit named this precisely: *"background jobs / outbox workers /
 * webhook handlers must re-resolve tenant; if they trust payload IDs, leakage or
 * mutation is possible."* Running it the first time found three handlers doing
 * exactly that, all written in the same week, all by somebody who had just
 * fixed the same class somewhere else.
 *
 * ⚠️ A HEURISTIC, like its sibling. It looks for reads of workspace-scoped
 * tables inside session-less files and checks the surrounding call for a
 * workspace predicate. It will miss a query built dynamically. The allowlist is
 * for reads that are legitimately cross-workspace — a platform-wide sweep, a
 * cron that must see every tenant — and every entry needs a reason, because an
 * allowlist without reasons is how a guard becomes a formality.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Where code runs with no session.
 *
 * ⚠️ Add a directory here the moment one is created. A new job package that
 * nobody adds is a new blind spot, and it will look exactly like the old one.
 */
const SESSIONLESS = [
	"packages/event-dispatch/src",
	"packages/jobs/src",
	"services/api/src/connect-webhook-routes.ts",
	"services/api/src/supplier-webhook-routes.ts",
	"services/api/src/stripe-webhook-routes.ts",
	"services/api/src/resend-webhook-routes.ts",
	"services/api/src/checkout-settlement.ts",
	"services/api/src/supplier-shipment.ts",
];

/**
 * Tables whose every row belongs to exactly one workspace.
 *
 * 🔴 Not the full list of workspace-scoped tables, and deliberately so: these
 * are the ones a handler actually reaches for, and the ones where reading
 * another tenant's row means money, stock or a customer's details.
 */
const SCOPED = [
	"orders",
	// ⚠️ NOT `orderLineItems`. It has no workspace column at all — a line is
	// scoped THROUGH its order, so requiring a predicate here would demand a
	// column that does not exist. Verified against the schema, 2026-08-22.
	"payments",
	"paymentRefunds",
	"paymentAccounts",
	"subscriptions",
	"subscriptionCycles",
	"inventoryItems",
	"catalogItems",
	"clientRecords",
	"workspaceCustomers",
	"shipments",
	"fulfillments",
	"suppliers",
	"supplierSkus",
	"purchaseOrders",
	"referralCodes",
	"shippingCarrierConnections",
];

/**
 * Reads that are deliberately cross-workspace, each with the reason.
 *
 * 🔴 A file lands here only when reading beyond one workspace is CORRECT.
 * "It is not reachable today" is not a reason — that is an argument about
 * exploitability, not about scope, and the three handlers this guard first
 * caught were all unreachable too.
 */
const ALLOWED = new Map([
	[
		"packages/event-dispatch/src/webhooks.ts",
		"The fan-out worker claims deliveries across every workspace by design; each delivery carries its own workspace and is scoped when it is sent.",
	],
]);

const problems = [];

function inspect(path) {
	const relative = path.replace(`${process.cwd()}/`, "");
	if (ALLOWED.has(relative)) return;
	const source = readFileSync(path, "utf8");

	for (const table of SCOPED) {
		const pattern = new RegExp(`\\.from\\(\\s*${table}\\s*\\)`, "g");
		let match = pattern.exec(source);
		while (match) {
			// The predicate usually follows within the same chained call.
			const window = source.slice(match.index, match.index + 900);
			const scoped = /workspaceId/.test(window);
			if (!scoped) {
				const line = source.slice(0, match.index).split("\n").length;
				problems.push(
					`${relative}:${line} reads ${table} without naming a workspace`,
				);
			}
			match = pattern.exec(source);
		}
	}
}

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

for (const target of SESSIONLESS) {
	const path = join(process.cwd(), target);
	let stats;
	try {
		stats = statSync(path);
	} catch {
		// A listed path that no longer exists is not a failure — files move. A
		// path that exists and is unswept is the thing worth failing over.
		continue;
	}
	if (stats.isDirectory()) walk(path);
	else inspect(path);
}

if (problems.length > 0) {
	console.error(
		`Handler isolation: ${problems.length} read(s) in session-less code do not name a workspace.\n`,
	);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(
		"\nEither scope the query to the event's workspace, or add the file to ALLOWED in this script WITH a reason.",
	);
	process.exit(1);
}

console.log(
	`Handler isolation: every read of ${SCOPED.length} workspace-scoped tables in session-less code names its workspace, or is allowlisted with a reason.`,
);
