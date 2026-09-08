import { and, db, eq, sql } from "@quickengine/db";
import type { QuickEnginePlanId } from "@quickengine/db/schema/quickengine";
import {
	quickengineSubscriptions,
	quickengineUsage,
} from "@quickengine/db/schema/quickengine";
import {
	evaluate,
	type LimitCheck,
	periodFor,
	withinGrace,
} from "./_metering-core";
import type { PlanLimits } from "./plans";
import {
	getPlanLimits,
	isPerSeatPlan,
	METER_KIND,
	type MeterKey,
	PLANS,
	type PlanCapability,
	purchasedStorageBytes,
} from "./plans";

export type { LimitCheck, LimitState } from "./_metering-core";

type MeterInput = { scopeId: string; meter: MeterKey; amount?: number };

// Usage is metered PER ACCOUNT; today the scope is the owning user id. Resolve
// which plan's limits apply — only an active/trialing subscription grants its
// plan, otherwise the account is on Free.
// A billing scope is an organization id (uuid). A non-uuid scope has no org subscription —
// return Free rather than letting Postgres throw on an invalid-uuid comparison.
const ORG_SCOPE_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything billing knows about an account, from one row.
 *
 * 🔴 One read rather than two. The plan and the storage add-on come from the
 * same subscription row and are needed together on every limit check, so
 * splitting them into two queries would double the database work on the hottest
 * path in the product for no reason other than tidiness.
 *
 * ⚠️ An account that is not entitled gets the Free answer for BOTH. Storage
 * packs are an add-on to a live subscription, so a lapsed account past its grace
 * loses the extra room along with the plan. Nothing is deleted by that: the
 * gauge refuses new uploads and the bytes stay exactly where they are.
 */
type AccountBilling = {
	planId: QuickEnginePlanId;
	storagePackId: string | null;
	storagePackQuantity: number;
};

const FREE_BILLING: AccountBilling = {
	planId: "free",
	storagePackId: null,
	storagePackQuantity: 0,
};

async function readAccountBilling(scopeId: string): Promise<AccountBilling> {
	if (!ORG_SCOPE_PATTERN.test(scopeId)) {
		return FREE_BILLING;
	}
	const [row] = await db
		.select({
			planId: quickengineSubscriptions.planId,
			status: quickengineSubscriptions.status,
			currentPeriodEndsAt: quickengineSubscriptions.currentPeriodEndsAt,
			storagePackId: quickengineSubscriptions.storagePackId,
			storagePackQuantity: quickengineSubscriptions.storagePackQuantity,
		})
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.organizationId, scopeId))
		.limit(1);
	if (!row) {
		return FREE_BILLING;
	}
	const entitled =
		row.status === "active" ||
		row.status === "trialing" ||
		withinLapseGrace(row.currentPeriodEndsAt);
	if (!entitled) {
		return FREE_BILLING;
	}
	return {
		planId: row.planId,
		storagePackId: row.storagePackId,
		storagePackQuantity: row.storagePackQuantity,
	};
}

export async function getAccountPlanId(
	scopeId: string,
): Promise<QuickEnginePlanId> {
	return (await readAccountBilling(scopeId)).planId;
}

/**
 * A week of road after a subscription lapses, for people who were PAYING.
 *
 * 🔴 A card expires on a Friday. Without this, a merchant's suppliers, purchase
 * orders and partner payouts stop that afternoon, and the first they hear of it
 * is a customer telling them their shop is broken. A failed renewal is almost
 * never a decision to leave, so treating it as one costs us a customer over an
 * expiry date they would happily have fixed.
 *
 * ⚠️ Grace is for lapsed PAID accounts only, and free never touches this: an
 * account with no subscription row returns "free" before we get here. It also
 * restores the WHOLE plan rather than the capability alone, because half a plan
 * is its own kind of broken. Their data is never locked either way.
 *
 * ⚠️ Not a substitute for dunning. This buys a week; the emails that tell them
 * are still owed.
 */
// ⚠️ Named for the LAPSE, not to be confused with `withinGrace` in
// `_metering-core`, which is a percentage a meter may overshoot its limit by.
// Two different graces, two different units.
const GRACE_DAYS = 7;

export function withinLapseGrace(periodEndsAt: Date | null): boolean {
	// No period end means we never recorded one, so there is nothing to measure
	// grace from. Fail closed rather than granting it indefinitely.
	if (!periodEndsAt) return false;
	const endsAt = periodEndsAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000;
	return Date.now() < endsAt;
}

// Record usage. Counters (actions) INCREMENT by `amount` (default 1); gauges
// (storage/seats/workspaces) SET to `amount`, the current total. Atomic via an
// upsert, so concurrent increments can't lose writes.
export async function meter({
	scopeId,
	meter: key,
	amount = 1,
}: MeterInput): Promise<void> {
	const { start, end } = periodFor(key);
	const gauge = METER_KIND[key] === "gauge";
	await db
		.insert(quickengineUsage)
		.values({
			scopeId,
			meter: key,
			periodStart: start,
			periodEnd: end,
			value: amount,
		})
		.onConflictDoUpdate({
			target: [
				quickengineUsage.scopeId,
				quickengineUsage.meter,
				quickengineUsage.periodStart,
			],
			set: {
				value: gauge ? amount : sql`${quickengineUsage.value} + ${amount}`,
				updatedAt: new Date(),
			},
		});
}

async function readValue(scopeId: string, key: MeterKey): Promise<number> {
	const { start } = periodFor(key);
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
 * The plan and the limits that actually apply to an account.
 *
 * 🔴 Every enforcement path must resolve limits through here, never through
 * `getPlanLimits(planId)` alone. A per-seat plan's allowances are meaningless
 * without the seat count, and a caller that forgets it would quietly hold a
 * fifty-person company to sixteen seats' worth of capacity.
 *
 * The seat count comes from the `seats` gauge, which member changes already
 * maintain — so there is no second source of truth to keep in step. It is read
 * only for per-seat plans, so the flat tiers pay nothing for this.
 */
/**
 * Whether an account's plan unlocks a capability.
 *
 * 🔴 The single gate between the free product and the paid one. It reads the
 * same subscription row `getAccountPlanId` does, so an expired or past-due
 * subscription loses the capability the moment it stops being `active` or
 * `trialing` — there is no separate flag to fall out of step with billing.
 *
 * ⚠️ Answers for an ORGANIZATION, not a workspace. Billing lives at the
 * organization because that is where Stripe does; a workspace inherits it. Two
 * workspaces under one paying organization both get it, which is correct: the
 * customer paid once.
 */
export async function hasCapability(
	scopeId: string,
	capability: PlanCapability,
): Promise<boolean> {
	const planId = await getAccountPlanId(scopeId);
	const plan = PLANS.find((candidate) => candidate.id === planId);
	return plan?.capabilities?.includes(capability) ?? false;
}

export async function getAccountLimits(
	scopeId: string,
): Promise<{ planId: QuickEnginePlanId; limits: PlanLimits }> {
	const billing = await readAccountBilling(scopeId);
	const { planId } = billing;
	const base = isPerSeatPlan(planId)
		? getPlanLimits(planId, await readValue(scopeId, "seats"))
		: getPlanLimits(planId);

	/**
	 * Purchased storage stacks on top of whatever the plan includes.
	 *
	 * ⚠️ Applied here rather than inside `getPlanLimits`, which answers "what
	 * does this PLAN include" and is read by the pricing page. A pack is a
	 * property of one account, not of a tier, and folding it into the plan's own
	 * answer would show every visitor an allowance somebody else paid for.
	 *
	 * An unlimited allowance stays unlimited: there is nothing to add to.
	 */
	const extra = purchasedStorageBytes(
		billing.storagePackId,
		billing.storagePackQuantity,
	);
	const limits =
		extra > 0 && base.storageBytes !== null
			? { ...base, storageBytes: base.storageBytes + extra }
			: base;

	return { planId, limits };
}

/** Read-only status of one meter for an account. */
export async function checkLimit({
	scopeId,
	meter: key,
}: {
	scopeId: string;
	meter: MeterKey;
}): Promise<LimitCheck> {
	const { limits } = await getAccountLimits(scopeId);
	return evaluate(key, limits[key], await readValue(scopeId, key));
}

export type EnforceResult = LimitCheck & {
	allowed: boolean;
	/**
	 * The plan whose limits were applied.
	 *
	 * Returned because it was resolved here anyway. Rate limiting needs the plan
	 * too, and looking it up a second time on the same request would be a second
	 * query for an answer already in hand.
	 */
	planId: QuickEnginePlanId;
};

/** Apply the enforcement policy without recording usage. */
export async function checkAllowance({
	scopeId,
	meter: key,
	amount = 1,
}: MeterInput): Promise<EnforceResult> {
	const { planId, limits } = await getAccountLimits(scopeId);
	const limit = limits[key];
	const used = await readValue(scopeId, key);
	const nextUsed = METER_KIND[key] === "gauge" ? amount : used + amount;

	/**
	 * 🔴 Gauges stop HARD at the limit. Counters keep the grace ceiling.
	 *
	 * The two kinds fail for different reasons and deserve different answers.
	 *
	 * A COUNTER is consumption in flight — an API call, an AI action. Refusing
	 * the request that happens to cross the line cuts somebody off mid-operation
	 * and leaves work half-written, so the crossing request is allowed and only
	 * the next one is refused. That policy is about not breaking things.
	 *
	 * A GAUGE is a possession: how many workspaces you have, how many seats are
	 * filled. There is no operation in flight to protect and nothing gets
	 * corrupted by saying no. Applying the same grace to a limit of ONE meant a
	 * free account could always hold TWO workspaces and TWO seats — the plan said
	 * one, the product allowed two, and the pricing page was quietly wrong.
	 *
	 * ⚠️ Checked against `nextUsed`, not `used`. A gauge check asks "may I have
	 * one more", so the number that matters is the one it would become.
	 */
	const allowed =
		METER_KIND[key] === "gauge"
			? limit === null || nextUsed <= limit
			: withinGrace(limit, used);
	return {
		...evaluate(key, limit, allowed ? nextUsed : used),
		allowed,
		planId,
	};
}

// The gate a module calls BEFORE starting a unit of work. Soft policy: work is
// allowed until usage passes the grace ceiling ((1 + GRACE) × limit), and the
// action that tips the account over is still allowed to finish. Only records the
// usage when allowed, so a blocked action isn't counted. Anything already in
// flight never calls this again, so it always completes.
export async function enforce({
	scopeId,
	meter: key,
	amount = 1,
}: MeterInput): Promise<EnforceResult> {
	const result = await checkAllowance({ scopeId, meter: key, amount });
	if (result.allowed) {
		await meter({ scopeId, meter: key, amount });
	}
	return result;
}

/** Every meter's status for an account — for the usage dashboard. */
export async function getUsage({
	scopeId,
}: {
	scopeId: string;
}): Promise<Record<MeterKey, LimitCheck>> {
	const { limits } = await getAccountLimits(scopeId);
	const meters = Object.keys(METER_KIND) as MeterKey[];
	const entries = await Promise.all(
		meters.map(
			async (key) =>
				[
					key,
					evaluate(key, limits[key], await readValue(scopeId, key)),
				] as const,
		),
	);
	return Object.fromEntries(entries) as Record<MeterKey, LimitCheck>;
}
