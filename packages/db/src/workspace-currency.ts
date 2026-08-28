import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { workspaceModules } from "./schema/workspace-modules";

/**
 * The money a workspace deals in.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 There was no workspace currency. Six modules each carried their own
 * `defaultCurrency`, every one of them defaulting to `USD` independently, and
 * the Settings screen wrote to exactly one of them. So a business could set
 * Canadian dollars, see it saved, and still have most of the product paying
 * attention to US dollars — a setting that governs one module and nothing else.
 *
 * 🔴 That is not cosmetic. A supplier SKU stored in a currency the product does
 * not share is SKIPPED by `checkoutSupplierObligation` rather than converted,
 * because converting would invent an exchange rate nobody agreed to. The
 * supplier is then never paid, no hold-back is taken, and NOTHING reports it.
 * Confirmed in a live workspace on 2026-08-28: three supplier SKUs entered
 * through the UI as "$15.00" all stored `USD` against `CAD` products.
 *
 * ── Why `orders` is the source ───────────────────────────────────────────────
 *
 * 🔑 It is what the Settings screen actually writes, alongside the order number
 * prefix and the tax rate. Rather than adding a seventh place to disagree, this
 * names the one a person can already see and change, and lets the rest defer to
 * it. The others are read only as a fallback for a workspace that predates the
 * settings screen, so nothing regresses for them.
 *
 * ⚠️ Fetched, not sub-queried — raw SQL subqueries do not survive the drizzle
 * driver. Same shape as `workspaceEnvironment`, deliberately.
 */

/** Money-bearing modules, in the order they should be believed. */
const CURRENCY_MODULES = [
	"orders",
	"products-services",
	"payments",
	"invoicing",
] as const;

/**
 * ⚠️ The last-resort fallback, and it should almost never be reached. A
 * workspace with no money module configured has nothing to price in yet.
 */
const FALLBACK = "USD";

export async function workspaceCurrency(workspaceId: string): Promise<string> {
	const rows = await db
		.select({
			moduleId: workspaceModules.moduleId,
			settings: workspaceModules.settings,
		})
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				inArray(workspaceModules.moduleId, [...CURRENCY_MODULES]),
			),
		);

	const byModule = new Map(rows.map((row) => [row.moduleId, row.settings]));
	for (const moduleId of CURRENCY_MODULES) {
		const settings = byModule.get(moduleId) as
			| { defaultCurrency?: unknown }
			| null
			| undefined;
		const currency = settings?.defaultCurrency;
		/**
		 * ⚠️ Length is checked, not just truthiness. `defaultCurrency` is plain
		 * JSON on the row rather than a validated column, so a hand-edited or
		 * half-migrated settings blob can hold anything at all.
		 */
		if (typeof currency === "string" && currency.trim().length === 3) {
			return currency.trim().toUpperCase();
		}
	}
	return FALLBACK;
}
