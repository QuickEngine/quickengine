import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./client";
import {
	quickengineCreditAutoRecharge,
	quickengineCreditEntries,
} from "./schema/quickengine";

/**
 * Prepaid AI credits.
 *
 * **Balance is `sum(amount_micros)` and nothing else.** No conditional arithmetic,
 * no "except the expired ones", no branch that could disagree with what the
 * customer sees on their statement. Every effect that changes a balance changes it
 * by writing a row, including expiry — see `expireCredits`.
 *
 * Keeping the sum unconditional is what makes the number defensible. The moment
 * the balance query has to reason about which rows count, the statement and the
 * balance can drift apart, and the customer is the one who finds out.
 */

export type CreditEntryKind =
	| "topup"
	| "spend"
	| "refund"
	| "adjustment"
	| "expiry";

/** The organization's spendable balance, in micros. 1,000,000 micros = $1. */
export async function creditBalanceMicros(
	organizationId: string,
): Promise<number> {
	const [row] = await db
		.select({
			balance: sql<number>`coalesce(sum(${quickengineCreditEntries.amountMicros}), 0)::bigint`,
		})
		.from(quickengineCreditEntries)
		.where(eq(quickengineCreditEntries.organizationId, organizationId));
	return Number(row?.balance ?? 0);
}

/**
 * What a workspace has spent since a given moment, as a positive number.
 *
 * This is what the per-workspace cap counts. Only `spend` rows are included:
 * a refund must not quietly restore headroom under the cap, or a workspace could
 * cycle spend and refunds to run indefinitely past a ceiling that exists precisely
 * to bound how fast one workspace can burn the account's money.
 */
export async function workspaceSpendMicros(
	workspaceId: string,
	since: Date,
): Promise<number> {
	const [row] = await db
		.select({
			spent: sql<number>`coalesce(-sum(${quickengineCreditEntries.amountMicros}), 0)::bigint`,
		})
		.from(quickengineCreditEntries)
		.where(
			and(
				eq(quickengineCreditEntries.workspaceId, workspaceId),
				eq(quickengineCreditEntries.kind, "spend"),
				gte(quickengineCreditEntries.createdAt, since),
			),
		);
	return Number(row?.spent ?? 0);
}

/**
 * Append one movement.
 *
 * `amountMicros` is signed by the caller: positive adds, negative consumes. The
 * sign is not inferred from `kind`, because a correction can legitimately go
 * either way and guessing would make some adjustments unrepresentable.
 */
export async function recordCreditEntry(input: {
	organizationId: string;
	workspaceId?: string | null;
	kind: CreditEntryKind;
	amountMicros: number;
	description?: string | null;
	agentRunId?: string | null;
	stripePaymentIntentId?: string | null;
	sourceEntryId?: string | null;
	expiresAt?: Date | null;
}) {
	const [entry] = await db
		.insert(quickengineCreditEntries)
		.values({
			organizationId: input.organizationId,
			workspaceId: input.workspaceId ?? null,
			kind: input.kind,
			amountMicros: input.amountMicros,
			description: input.description ?? null,
			agentRunId: input.agentRunId ?? null,
			stripePaymentIntentId: input.stripePaymentIntentId ?? null,
			sourceEntryId: input.sourceEntryId ?? null,
			expiresAt: input.expiresAt ?? null,
		})
		.returning();
	return entry;
}

/** Postgres unique-violation, the same check `recordPayment` uses. */
const isUniqueViolation = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: string }).code === "23505";

const findTopUpByPaymentIntent = async (stripePaymentIntentId: string) => {
	const [existing] = await db
		.select()
		.from(quickengineCreditEntries)
		.where(
			eq(quickengineCreditEntries.stripePaymentIntentId, stripePaymentIntentId),
		);
	return existing;
};

/**
 * Record a top-up, ignoring a payment Stripe has already been credited for.
 *
 * Stripe retries webhooks on any non-2xx, on timeouts, and sometimes simply
 * because it decides to. Without this, one retry is free money for the customer
 * and a hole in ours.
 *
 * Look up, insert, and on a unique violation look up again — the same shape
 * `recordPayment` uses for exactly the same reason. `on conflict do nothing` is
 * deliberately *not* used: the index is partial, and Postgres only infers a
 * partial index when the predicate is repeated in the conflict target, which is
 * a subtlety that would silently stop working if the index were ever changed.
 * The lookup-and-catch works regardless of how the constraint is expressed.
 *
 * Returns the existing entry on a replay, so the caller cannot tell the
 * difference and does not need to care.
 */
export async function recordTopUp(input: {
	organizationId: string;
	amountMicros: number;
	stripePaymentIntentId: string;
	description?: string | null;
	expiresAt?: Date | null;
}) {
	const seen = await findTopUpByPaymentIntent(input.stripePaymentIntentId);
	if (seen) return seen;

	try {
		const [entry] = await db
			.insert(quickengineCreditEntries)
			.values({
				organizationId: input.organizationId,
				kind: "topup",
				amountMicros: input.amountMicros,
				description: input.description ?? null,
				stripePaymentIntentId: input.stripePaymentIntentId,
				expiresAt: input.expiresAt ?? null,
			})
			.returning();
		return entry;
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		// Two deliveries of the same webhook raced: both passed the lookup above and
		// the index caught the loser. It now finds the row the winner committed.
		// Exactly one top-up exists either way.
		return await findTopUpByPaymentIntent(input.stripePaymentIntentId);
	}
}

/**
 * Realize expiry by writing offsetting rows, rather than by filtering the balance.
 *
 * An expired credit is not deleted and not hidden: it is cancelled by a negative
 * `expiry` row of equal size. That keeps `balance = sum(amount)` unconditionally
 * true, and it leaves the customer a statement that shows what they lost and when
 * — which a filtered query never could.
 *
 * Idempotent per source entry: a top-up that has already been expired is skipped,
 * so running this twice cannot double-charge anyone.
 */
export async function expireCredits(now: Date = new Date()): Promise<number> {
	// One statement, so a crash midway cannot leave some credits expired and others
	// not. `not exists` makes it idempotent: an entry already cancelled is skipped,
	// so running this twice never charges anyone twice.
	//
	// The timestamp is serialised by hand because `db.execute` passes raw template
	// values straight to the driver, which wants a string — unlike the query
	// builder, which converts Dates for you.
	const inserted = await db.execute(sql`
		insert into ${quickengineCreditEntries}
			(organization_id, kind, amount_micros, description, source_entry_id)
		select
			source.organization_id,
			'expiry',
			-source.amount_micros,
			'Unused credits expired',
			source.id
		from ${quickengineCreditEntries} as source
		where source.expires_at is not null
		  and source.expires_at <= ${now.toISOString()}::timestamptz
		  and source.amount_micros > 0
		  and not exists (
			select 1 from ${quickengineCreditEntries} as cancelled
			where cancelled.kind = 'expiry'
			  and cancelled.source_entry_id = source.id
		  )
		returning id`);
	return inserted.length;
}

/** Auto-recharge settings for an organization, or null when never configured. */
export async function getAutoRecharge(organizationId: string) {
	const [row] = await db
		.select()
		.from(quickengineCreditAutoRecharge)
		.where(eq(quickengineCreditAutoRecharge.organizationId, organizationId));
	return row ?? null;
}

/**
 * Turn auto-recharge on or off, or record why it stopped.
 *
 * Upsert rather than insert-or-update at the call site: this is written from a
 * settings form, a successful charge, and a failure handler, and all three want
 * "make it say this" rather than to care whether a row already exists.
 */
export async function setAutoRecharge(input: {
	organizationId: string;
	enabled: boolean;
	thresholdMicros?: number;
	amountCents?: number;
	stripePaymentMethodId?: string | null;
	lastFailureAt?: Date | null;
	lastFailureReason?: string | null;
}) {
	const values = {
		organizationId: input.organizationId,
		enabled: input.enabled,
		thresholdMicros: input.thresholdMicros ?? 0,
		amountCents: input.amountCents ?? 0,
		stripePaymentMethodId: input.stripePaymentMethodId ?? null,
		lastFailureAt: input.lastFailureAt ?? null,
		lastFailureReason: input.lastFailureReason ?? null,
	};
	const [row] = await db
		.insert(quickengineCreditAutoRecharge)
		.values(values)
		.onConflictDoUpdate({
			target: quickengineCreditAutoRecharge.organizationId,
			set: { ...values, updatedAt: new Date() },
		})
		.returning();
	return row;
}
