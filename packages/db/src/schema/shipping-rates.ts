import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING ZONES AND RATES — what a business charges to deliver something.
//
// 🔴 A wrong shipping rate is money out of the merchant's pocket on every single
// order, and unlike a wrong price nobody notices it for weeks. That is why this
// is modelled rather than ported: the prototype's version
// (`~/Desktop/Projects/QuickEngine/quickdash/packages/db/src/schema/shipping.ts`)
// is not safe to copy, for four reasons that are all fixed here.
//
// 1. **It used `decimal` for money.** Every other money column in this codebase
//    is integer cents. Mixing the two is how a rounding difference becomes a
//    reconciliation problem. Cents and grams, integers throughout.
// 2. **Zone matching was ambiguous.** Two zones could both list `CA` and nothing
//    decided which applied — so the rate charged depended on row order, which is
//    to say on nothing. Resolved here by `matchPrecedence`; see below.
// 3. **Rates hung off a CARRIER, not a zone.** That models "what UPS charges",
//    which is a carrier-integration concern we do not have. What a merchant
//    actually needs first is "what I charge to ship to Alberta."
// 4. **Weight bands existed with nothing to weigh.** Nothing in our catalog had
//    a weight, so every weight-banded rate would have matched nothing, silently.
//    `catalog_items.weight_grams` is added in the same migration as this table.
//
// ⚠️ **This is not carrier rating.** No live rates, no label purchase, no
// dimensional weight. `MODULES.md` already records that Shipping "does not claim
// to buy labels", and dimensions are deliberately NOT stored: dimensional weight
// is meaningless without a carrier API to feed it, and an unused column invites
// somebody to trust it later.
// ─────────────────────────────────────────────────────────────────────────────

export const shippingZones = pgTable(
	"shipping_zones",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/** What the operator calls it — "Canada", "Alberta local", "Rest of world". */
		name: text("name").notNull(),

		/**
		 * ISO 3166-1 alpha-2, uppercase. Empty means "anywhere", which is how a
		 * catch-all zone is expressed.
		 *
		 * ⚠️ Stored as a Postgres array rather than jsonb (the prototype's choice)
		 * so membership is a real indexed `= ANY(...)` test instead of a jsonb
		 * containment query on a column no index can help.
		 */
		countryCodes: text("country_codes")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),

		/**
		 * Subdivisions, as ISO 3166-2 (`CA-AB`, `US-CA`). Empty means the whole
		 * country.
		 *
		 * 🔴 A zone naming regions is MORE SPECIFIC than one naming only countries,
		 * and that is what `matchPrecedence` encodes. Without it, "Canada $15" and
		 * "Alberta local $5" are both valid answers for an Alberta address.
		 */
		regionCodes: text("region_codes")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),

		/**
		 * Operator tiebreak, higher wins, applied AFTER specificity.
		 *
		 * This exists so two equally specific zones still resolve deterministically
		 * — the final tiebreak is `createdAt`, so the answer never depends on the
		 * order Postgres happened to return rows in.
		 */
		priority: integer("priority").notNull().default(0),

		active: boolean("active").notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shipping_zones_workspace_name_key").on(
			table.workspaceId,
			table.name,
		),
		index("shipping_zones_workspace_active_idx").on(
			table.workspaceId,
			table.active,
		),
	],
);

export const shippingRates = pgTable(
	"shipping_rates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		zoneId: uuid("zone_id")
			.notNull()
			.references(() => shippingZones.id, { onDelete: "restrict" }),

		/** What the customer sees at checkout — "Standard", "Express". */
		name: text("name").notNull(),
		description: text("description"),

		// ── When this rate applies ──────────────────────────────────────────────
		//
		// All four bounds are nullable, and null means "no bound". A flat rate sets
		// none of them. There is deliberately no `kind` discriminator: a rate that
		// is both weight-banded and order-value-banded is a legitimate thing to
		// want, and a discriminator would forbid it for no benefit.
		//
		// ⚠️ Bounds are **inclusive minimum, exclusive maximum**. Two bands written
		// 0–1000 and 1000–5000 must not both match at exactly 1000g, and half-open
		// is the only convention where a merchant filling in adjacent bands gets
		// that right without being told.

		minWeightGrams: integer("min_weight_grams"),
		maxWeightGrams: integer("max_weight_grams"),
		minOrderCents: integer("min_order_cents"),
		maxOrderCents: integer("max_order_cents"),

		// ── What it costs ───────────────────────────────────────────────────────

		/** Charged whenever this rate applies. A flat rate is this alone. */
		baseCents: integer("base_cents").notNull().default(0),

		/**
		 * Added per kilogram of billable weight, rounded up to the next whole
		 * kilogram at quote time.
		 *
		 * 🔴 If this is set, every item in the basket MUST have a weight. Treating a
		 * missing weight as zero undercharges the merchant on exactly the orders
		 * where shipping costs most — so the quote refuses instead. See
		 * `MISSING_ITEM_WEIGHT` in the module.
		 */
		perKgCents: integer("per_kg_cents"),

		/**
		 * Free shipping at or above this order value, compared against the
		 * DISCOUNTED subtotal.
		 *
		 * ⚠️ Discounted, deliberately. "Free shipping over $100" measured before a
		 * discount gives free shipping to somebody who paid $70, which is not what
		 * the merchant advertised and not what they budgeted for.
		 */
		freeOverCents: integer("free_over_cents"),

		/** Shown to the customer as a range. Presentation only — nothing schedules on it. */
		estimatedDaysMin: integer("estimated_days_min"),
		estimatedDaysMax: integer("estimated_days_max"),

		active: boolean("active").notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shipping_rates_zone_name_key").on(table.zoneId, table.name),
		index("shipping_rates_workspace_zone_idx").on(
			table.workspaceId,
			table.zoneId,
		),
		// Money is never negative. These are the mistakes a form can make that the
		// application layer might not catch, so the database refuses them outright.
		check("shipping_rates_base_cents_check", sql`${table.baseCents} >= 0`),
		check(
			"shipping_rates_per_kg_cents_check",
			sql`${table.perKgCents} IS NULL OR ${table.perKgCents} >= 0`,
		),
		check(
			"shipping_rates_free_over_cents_check",
			sql`${table.freeOverCents} IS NULL OR ${table.freeOverCents} >= 0`,
		),
		// A band whose maximum is below its minimum matches nothing, forever, and
		// looks like a working rate in the UI.
		check(
			"shipping_rates_weight_band_check",
			sql`${table.minWeightGrams} IS NULL OR ${table.maxWeightGrams} IS NULL OR ${table.maxWeightGrams} > ${table.minWeightGrams}`,
		),
		check(
			"shipping_rates_order_band_check",
			sql`${table.minOrderCents} IS NULL OR ${table.maxOrderCents} IS NULL OR ${table.maxOrderCents} > ${table.minOrderCents}`,
		),
	],
);
