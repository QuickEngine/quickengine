#!/usr/bin/env node
/**
 * The five numbers that say whether this is becoming a business.
 *
 * 🔴 Written because the leading indicator was unmeasurable. The analytics
 * provider is a no-op, so "how many workspaces connected a supplier this week"
 * — the one number that tells a bad pitch apart from a bad product — could not
 * be answered at all. Everything here is a query against tables that already
 * exist. No vendor, no event pipeline, no instrumentation to drift.
 *
 * ⚠️ These are DELIBERATELY not product analytics. They do not track a person
 * through the app and they store nothing new. They count rows that exist because
 * a business did something real: connected a supplier, raised a purchase order,
 * paid an invoice.
 *
 *   node packages/db/metrics.mjs [--url <database>] [--json]
 */
import { spawnSync } from "node:child_process";

const arg = (name) => {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
};

const url = arg("url") ?? process.env.DATABASE_URL;
if (!url) {
	console.error("\n✗ No database URL. Pass --url or set DATABASE_URL.\n");
	process.exit(1);
}

const query = (sql) => {
	const out = spawnSync("psql", [url, "-tAc", sql], { encoding: "utf8" });
	if (out.status !== 0) {
		console.error(`\n✗ ${(out.stderr || "").trim().slice(0, 300)}\n`);
		process.exit(1);
	}
	return out.stdout.trim();
};

/**
 * ⚠️ "Active" is fourteen days of real activity, not a login.
 *
 * A workspace somebody signs into and does nothing in is not a customer, it is
 * a tab. Orders and purchase orders are the events that mean the business ran
 * through us.
 */
const ACTIVE_WINDOW = "14 days";

/**
 * 🔴 Plans that are NOT revenue, however active the subscription looks.
 *
 * `bypass` and `enterprise` are marked `internal: true` in `plans.ts` — assigned
 * by hand, never sold. The first version of this script excluded only `free`,
 * so a comped internal account counted as a paying customer and the single most
 * important number on the page read 1 when the truth was 0. A metric that
 * flatters is worse than no metric.
 */
const NOT_REVENUE = "('free', 'bypass', 'enterprise')";

const metrics = {
	/**
	 * The leading indicator. A workspace that connects a supplier has crossed
	 * from "trying it" to "running something through it", and it is the exact
	 * capability Commerce is sold on.
	 */
	workspacesWithSecondParty: query(`
		SELECT count(DISTINCT w.id) FROM quickengine_workspaces w
		WHERE EXISTS (SELECT 1 FROM suppliers s WHERE s.workspace_id = w.id)
		   OR EXISTS (SELECT 1 FROM supplier_connections c WHERE c.workspace_id = w.id)
		   OR EXISTS (SELECT 1 FROM purchase_orders p WHERE p.workspace_id = w.id)`),

	/** Paying, by the same subscription row the gate reads. */
	payingAccounts: query(`
		SELECT count(*) FROM quickengine_subscriptions
		WHERE status IN ('active', 'trialing') AND plan_id NOT IN ${NOT_REVENUE}`),

	/** Paying AND doing something. The number that is not vanity. */
	activePayingWorkspaces: query(`
		SELECT count(DISTINCT w.id) FROM quickengine_workspaces w
		JOIN quickengine_subscriptions s ON s.organization_id = w.organization_id
		WHERE s.status IN ('active', 'trialing') AND s.plan_id NOT IN ${NOT_REVENUE}
		  AND (EXISTS (SELECT 1 FROM orders o WHERE o.workspace_id = w.id
		               AND o.created_at > now() - interval '${ACTIVE_WINDOW}')
		    OR EXISTS (SELECT 1 FROM purchase_orders p WHERE p.workspace_id = w.id
		               AND p.created_at > now() - interval '${ACTIVE_WINDOW}'))`),

	/** Everything, so the ratios above mean something. */
	totalWorkspaces: query("SELECT count(*) FROM quickengine_workspaces"),

	/** Real commerce in the window, whoever it belongs to. */
	ordersLast14Days: query(`
		SELECT count(*) FROM orders WHERE created_at > now() - interval '${ACTIVE_WINDOW}'`),

	purchaseOrdersLast14Days: query(`
		SELECT count(*) FROM purchase_orders WHERE created_at > now() - interval '${ACTIVE_WINDOW}'`),
};

const n = (v) => Number(v || 0);

if (process.argv.includes("--json")) {
	console.log(
		JSON.stringify(
			{ capturedAt: new Date().toISOString(), ...metrics },
			null,
			2,
		),
	);
	process.exit(0);
}

const pct = (part, whole) =>
	n(whole) === 0 ? "—" : `${Math.round((n(part) / n(whole)) * 100)}%`;

console.log(`
  QuickDash — the five numbers        ${new Date().toISOString().slice(0, 10)}

  Workspaces total                    ${metrics.totalWorkspaces}
  …with a supplier or PO              ${metrics.workspacesWithSecondParty}   ${pct(metrics.workspacesWithSecondParty, metrics.totalWorkspaces)} of all
                                      ↑ the leading indicator

  Paying accounts                     ${metrics.payingAccounts}
  Active paying workspaces            ${metrics.activePayingWorkspaces}   ${pct(metrics.activePayingWorkspaces, metrics.payingAccounts)} of paying
                                      ↑ the one that is not vanity

  Orders, last 14 days                ${metrics.ordersLast14Days}
  Purchase orders, last 14 days       ${metrics.purchaseOrdersLast14Days}

  If the first and last are not rising while features ship,
  the bottleneck is distribution, not the product.
`);
