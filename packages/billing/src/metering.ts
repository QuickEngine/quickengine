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
import { getPlanLimits, METER_KIND, type MeterKey } from "./plans";

export type { LimitCheck, LimitState } from "./_metering-core";

type MeterInput = { scopeId: string; meter: MeterKey; amount?: number };

// Usage is metered PER ACCOUNT; today the scope is the owning user id. Resolve
// which plan's limits apply — only an active/trialing subscription grants its
// plan, otherwise the account is on Free.
export async function getAccountPlanId(
	scopeId: string,
): Promise<QuickEnginePlanId> {
	const [row] = await db
		.select({
			planId: quickengineSubscriptions.planId,
			status: quickengineSubscriptions.status,
		})
		.from(quickengineSubscriptions)
		.where(eq(quickengineSubscriptions.userId, scopeId))
		.limit(1);
	if (!row) {
		return "free";
	}
	return row.status === "active" || row.status === "trialing"
		? row.planId
		: "free";
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

/** Read-only status of one meter for an account. */
export async function checkLimit({
	scopeId,
	meter: key,
}: {
	scopeId: string;
	meter: MeterKey;
}): Promise<LimitCheck> {
	const planId = await getAccountPlanId(scopeId);
	const limit = getPlanLimits(planId)[key];
	return evaluate(key, limit, await readValue(scopeId, key));
}

export type EnforceResult = LimitCheck & { allowed: boolean };

/** Apply the enforcement policy without recording usage. */
export async function checkAllowance({
	scopeId,
	meter: key,
	amount = 1,
}: MeterInput): Promise<EnforceResult> {
	const planId = await getAccountPlanId(scopeId);
	const limit = getPlanLimits(planId)[key];
	const used = await readValue(scopeId, key);
	const allowed = withinGrace(limit, used);
	const nextUsed = METER_KIND[key] === "gauge" ? amount : used + amount;
	return { ...evaluate(key, limit, allowed ? nextUsed : used), allowed };
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
	const limits = getPlanLimits(await getAccountPlanId(scopeId));
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
