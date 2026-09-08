import { and, db, eq, sql } from "@quickengine/db";
import type { QuickEnginePlanId } from "@quickengine/db/schema/quickengine";
import {
	quickengineSubscriptions,
	quickengineUsage,
} from "@quickengine/db/schema/quickengine";
import { counterPeriod, SENTINEL_PERIOD } from "./_metering-core";
import { getAccountLimits } from "./metering";
import { billOverage } from "./overage";
import {
	FREE_OVERAGE_CAP_CENTS,
	METER_KIND,
	METER_LABELS,
	type MeterKey,
	overageFor,
	purchasedStorageBytes,
	storageRebateCents,
} from "./plans";
import { getStripe, isStripeConfigured } from "./stripe";

/**
 * The monthly usage billing run.
 *
 * 🔴 **This did not exist until now, and without it none of the pricing model
 * charged anybody a penny.** Every part was built and correct in isolation:
 * `OVERAGE` priced the meters, `overageFor` kept paying customers off the
 * per-record prices, `FREE_OVERAGE_CAP_CENTS` bounded a free account's bill, and
 * `billOverage` wrote the invoice item. Nothing called `billOverage`. The whole
 * free-tier model was decoration, which is the fifth time this exact shape has
 * been found in this codebase: a thing that exists, looks right, and is enforced
 * by nothing.
 *
 * ── Why once a month and not continuously ────────────────────────────────────
 *
 * ⚠️ `billOverage` charges the TOTAL over the allowance, not an increment. Call
 * it twice in a period and the customer is billed for the first total and then
 * the second, so three blocks followed by five bills eight. Its idempotency key
 * protects a retry of the SAME call, not a later call with more usage. So this
 * runs exactly once per account per period, after the period has closed.
 *
 * Counters are read from the month that just ended; storage is a gauge with no
 * period at all, so it is measured at the moment of the run. Both are the
 * numbers a customer would arrive at themselves.
 */

/** One line of a bill, before it reaches Stripe. */
export type UsageBillLine = {
	meter: MeterKey;
	label: string;
	unitsOver: number;
	blocks: number;
	cents: number;
};

export type UsageBill = {
	organizationId: string;
	planId: QuickEnginePlanId;
	/** The month billed, as `YYYY-MM`. */
	period: string;
	lines: UsageBillLine[];
	/** Cents credited back under the cheaper-of-pack-or-overage rule. */
	rebateCents: number;
	/** What was actually charged, after the cap and the rebate. */
	chargedCents: number;
	/** True when a free account's bill was clipped by the spend cap. */
	capped: boolean;
};

/**
 * The order meters are billed in, and it only matters when the cap bites.
 *
 * 🔴 Cost recovery first. Storage, AI, email and API requests are money we have
 * already spent with Cloudflare, Anthropic and Resend; the record meters cost us
 * nothing to hold and exist to move somebody onto a plan. If a free account's
 * bill is clipped at the cap, the part that survives should be the part that
 * pays a real invoice we owe somebody else.
 *
 * ⚠️ Deterministic on purpose. A cap applied in a different order each run would
 * charge different meters for the same usage, which nobody could reconcile.
 */
const BILLING_ORDER: readonly MeterKey[] = [
	"storageBytes",
	"aiActions",
	"emailsSent",
	"apiRequests",
	"ordersPerMonth",
	"activeProducts",
	"bookingsPerMonth",
	"invoicesPerMonth",
	"contractsPerMonth",
	"quotesPerMonth",
	"projectsPerMonth",
	"timeEntriesPerMonth",
	"shipmentsPerMonth",
	"clientsPerMonth",
];

/** The `YYYY-MM` label for the month before `now`. */
export const periodJustEnded = (now: Date = new Date()): string => {
	const start = counterPeriod(now).start;
	const previous = new Date(
		Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
	);
	return previous.toISOString().slice(0, 7);
};

/**
 * Read one meter's value for the month that just closed.
 *
 * ⚠️ Counters are read from the CLOSED month, gauges from their single
 * all-time row. Reading a counter's current row on the first of the month would
 * bill a customer for the few hours of the new month that had elapsed, and
 * quietly let the whole previous month go uncharged.
 */
async function readClosedValue(
	scopeId: string,
	key: MeterKey,
	now: Date,
): Promise<number> {
	const start =
		METER_KIND[key] === "counter"
			? new Date(
					Date.UTC(
						counterPeriod(now).start.getUTCFullYear(),
						counterPeriod(now).start.getUTCMonth() - 1,
						1,
					),
				)
			: SENTINEL_PERIOD.start;
	const [row] = await db
		.select({ value: quickengineUsage.value })
		.from(quickengineUsage)
		.where(
			and(
				eq(quickengineUsage.scopeId, scopeId),
				eq(quickengineUsage.meter, key),
				eq(quickengineUsage.periodStart, start),
			),
		)
		.limit(1);
	return row?.value ?? 0;
}

/**
 * Bill one account for the month that just ended.
 *
 * Safe to call when nothing is owed, which is the overwhelming majority of
 * accounts: it reads meters, finds nothing over an allowance, and writes
 * nothing to Stripe.
 */
export async function billAccountUsage({
	organizationId,
	now = new Date(),
}: {
	organizationId: string;
	now?: Date;
}): Promise<UsageBill> {
	const period = periodJustEnded(now);
	const { planId, limits } = await getAccountLimits(organizationId);

	const bill: UsageBill = {
		organizationId,
		planId,
		period,
		lines: [],
		rebateCents: 0,
		chargedCents: 0,
		capped: false,
	};

	/**
	 * ⚠️ The cap applies to FREE accounts only. Every paid tier is charged for
	 * what it used, because on a paid tier the only priced meters are the ones
	 * that cost us money and capping those would mean absorbing somebody else's
	 * infrastructure bill.
	 */
	let budget = planId === "free" ? FREE_OVERAGE_CAP_CENTS : undefined;

	for (const meter of BILLING_ORDER) {
		const price = overageFor(planId, meter);
		if (!price) continue;
		const limit = limits[meter];
		// No allowance means unlimited, so there is nothing to be over.
		if (limit === null) continue;
		if (budget !== undefined && budget <= 0) {
			bill.capped = true;
			break;
		}

		const used = await readClosedValue(organizationId, meter, now);
		const unitsOver = used - limit;
		if (unitsOver <= 0) continue;

		const charge = await billOverage({
			organizationId,
			meter,
			unitsOverAllowance: unitsOver,
			...(budget === undefined ? {} : { maxCents: budget }),
		});
		if (!charge.charged) continue;

		bill.lines.push({
			meter,
			label: METER_LABELS[meter],
			unitsOver,
			blocks: charge.blocks,
			cents: charge.cents,
		});
		bill.chargedCents += charge.cents;
		if (budget !== undefined) {
			budget -= charge.cents;
			// Charged less than the meter was worth: the cap did the clipping.
			if (
				charge.cents <
				Math.floor(unitsOver / price.blockSize) * price.cents
			) {
				bill.capped = true;
			}
		}
	}

	bill.rebateCents = await creditStorageRebate({
		organizationId,
		limits: limits.storageBytes,
		now,
		period,
	});
	bill.chargedCents -= bill.rebateCents;

	return bill;
}

/**
 * Give back the difference when somebody's packs cost more than overage would.
 *
 * See `storageRebateCents` for why this exists at all: the larger packs are
 * cheaper per gigabyte than overage is, so a customer who buys ahead and does
 * not fill the pack would otherwise pay MORE than one who bought nothing. A
 * negative invoice item is the whole mechanism, and it lands on the same invoice
 * as the pack it corrects.
 *
 * ⚠️ Idempotent on the account, the period and the amount, exactly like an
 * overage line. A redelivered run credits nothing twice.
 */
async function creditStorageRebate({
	organizationId,
	limits,
	now,
	period,
}: {
	organizationId: string;
	/** The storage allowance INCLUDING packs, as enforcement sees it. */
	limits: number | null;
	now: Date;
	period: string;
}): Promise<number> {
	if (!isStripeConfigured()) return 0;

	const [row] = await db
		.select({
			packId: quickengineSubscriptions.storagePackId,
			quantity: quickengineSubscriptions.storagePackQuantity,
			stripeCustomerId: quickengineSubscriptions.stripeCustomerId,
			status: quickengineSubscriptions.status,
		})
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.organizationId, organizationId))
		.limit(1);

	if (!row?.packId || row.quantity <= 0 || !row.stripeCustomerId) return 0;
	if (row.status !== "active" && row.status !== "trialing") return 0;

	const packBytes = purchasedStorageBytes(row.packId, row.quantity);
	// The plan's own allowance is what is left once the packs are taken back out.
	// An unlimited plan cannot be over anything, so it can never owe overage and
	// there is nothing for the packs to have been cheaper than.
	if (limits === null) return 0;
	const planBytes = limits - packBytes;

	const used = await readClosedValue(organizationId, "storageBytes", now);
	const rebate = storageRebateCents({
		packId: row.packId,
		quantity: row.quantity,
		bytesOverPlan: Math.max(0, used - planBytes),
	});
	if (rebate <= 0) return 0;

	await getStripe().invoiceItems.create(
		{
			customer: row.stripeCustomerId,
			// Negative: a credit against the pack the customer already paid for.
			amount: -rebate,
			currency: "usd",
			description: `Storage adjustment: you used less than your extra storage in ${period}`,
			metadata: { organizationId, period, kind: "storage_rebate" },
		},
		{
			idempotencyKey: `storage-rebate:${organizationId}:${period}:${rebate}`,
		},
	);
	return rebate;
}

/**
 * Every organization that could owe something, for the scheduled run.
 *
 * ⚠️ Only accounts with a Stripe customer. An account with no customer has no
 * card, so there is nothing to charge and asking their meters would be work
 * done to reach a foregone conclusion. **That includes almost every free
 * account**, which is the honest limit of free-tier overage today: the prices
 * are real and enforced, but nothing collects from somebody who never gave us a
 * payment method. See `LAUNCH.md`.
 */
export async function organizationsToBill(): Promise<string[]> {
	const rows = await db
		.select({ organizationId: quickengineSubscriptions.organizationId })
		.from(quickengineSubscriptions)
		.where(sql`${quickengineSubscriptions.stripeCustomerId} is not null`);
	return rows.map((row) => row.organizationId);
}

/** Bill every account that could owe something. Returns the bills that charged. */
export async function runUsageBilling({
	now = new Date(),
}: {
	now?: Date;
} = {}): Promise<{
	accounts: number;
	charged: UsageBill[];
	failed: number;
}> {
	const organizations = await organizationsToBill();
	const charged: UsageBill[] = [];
	let failed = 0;

	for (const organizationId of organizations) {
		try {
			const bill = await billAccountUsage({ organizationId, now });
			if (bill.lines.length > 0 || bill.rebateCents > 0) charged.push(bill);
		} catch (error) {
			// 🔴 One account's failure must never stop the run. A Stripe error on a
			// single customer would otherwise leave every account after it in the
			// list unbilled for the month, and nobody would notice until the
			// revenue was missing.
			failed += 1;
			console.error(
				`[usage-billing] ${organizationId} failed (${error instanceof Error ? error.name : "UnknownError"})`,
			);
		}
	}

	return { accounts: organizations.length, charged, failed };
}
