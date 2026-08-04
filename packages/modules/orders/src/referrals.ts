import { randomBytes } from "node:crypto";
import {
	and,
	db,
	eq,
	inArray,
	REFERRAL_REWARD_TYPES,
	referralCodes,
	referrals,
	sql,
} from "@quickengine/db";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// REFERRALS.
//
// A customer shares a code; a new customer uses it at checkout; the referrer
// earns something once the order settles.
//
// 🔴 Three rules do all the work of keeping this honest, and every one of them
// is the first thing somebody tries:
//   1. You cannot refer yourself.
//   2. A customer can be referred ONCE, ever — the reward is for BRINGING a
//      customer, and a customer is only brought once.
//   3. The reward is snapshotted when the referral is made, never recomputed.
// ─────────────────────────────────────────────────────────────────────────────

/** Reward the workspace pays per successful referral. Lives in orders settings. */
export const referralSettingsSchema = z.object({
	enabled: z.boolean().default(false),
	rewardType: z.enum(REFERRAL_REWARD_TYPES).default("fixed"),
	/** Minor units when `fixed`; basis points when `percentage`. Integers only. */
	rewardValue: z.number().int().min(0).max(1_000_000).default(0),
});

export type ReferralSettings = z.infer<typeof referralSettingsSchema>;

export type ReferralRejection =
	| "NOT_FOUND"
	| "SELF_REFERRAL"
	| "ALREADY_REFERRED"
	| "DISABLED";

export type ReferralEvaluation =
	| {
			ok: true;
			referralCodeId: string;
			referrerClientRecordId: string;
			rewardType: "fixed" | "percentage";
			rewardAmountCents: number;
	  }
	| { ok: false; reason: ReferralRejection; message: string };

const REJECTION_MESSAGE: Record<ReferralRejection, string> = {
	NOT_FOUND: "That referral code isn't recognised.",
	SELF_REFERRAL: "You can't refer yourself.",
	ALREADY_REFERRED: "You've already been referred.",
	DISABLED: "This business isn't running a referral programme.",
};

function reject(reason: ReferralRejection): ReferralEvaluation {
	return { ok: false, reason, message: REJECTION_MESSAGE[reason] };
}

/**
 * What a referral is worth on an order of this size.
 *
 * Rounds DOWN for the same reason discounts do — rounding up pays out money the
 * shop never agreed to, one penny at a time.
 */
export function referralRewardCents(
	settings: Pick<ReferralSettings, "rewardType" | "rewardValue">,
	orderSubtotalCents: number,
): number {
	if (settings.rewardValue <= 0) return 0;
	if (settings.rewardType === "fixed") return settings.rewardValue;
	if (orderSubtotalCents <= 0) return 0;
	return Math.floor((orderSubtotalCents * settings.rewardValue) / 10_000);
}

/**
 * A code, generated once and reused.
 *
 * ⚠️ Random, not derived from the customer's name. A predictable code lets
 * anyone guess a stranger's and attribute referrals to them — and a name-based
 * code leaks who the customer is to whoever receives the link.
 *
 * Retries on collision rather than assuming: 8 base32 characters is roughly a
 * trillion codes, but "unlikely" is not "impossible" and the unique index would
 * throw at the worst moment.
 */
export async function issueReferralCode(input: {
	workspaceId: string;
	clientRecordId: string;
}): Promise<{
	code: string;
	totalReferrals: number;
	totalEarnedCents: number;
}> {
	const [existing] = await db
		.select()
		.from(referralCodes)
		.where(
			and(
				eq(referralCodes.workspaceId, input.workspaceId),
				eq(referralCodes.ownerClientRecordId, input.clientRecordId),
			),
		)
		.limit(1);

	// Asking twice returns the same code. A second code would break every link
	// the customer has already shared.
	if (existing) {
		return {
			code: existing.code,
			totalReferrals: existing.totalReferrals,
			totalEarnedCents: existing.totalEarnedCents,
		};
	}

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = randomCode();
		try {
			const [row] = await db
				.insert(referralCodes)
				.values({
					workspaceId: input.workspaceId,
					ownerClientRecordId: input.clientRecordId,
					code,
				})
				.returning();
			return {
				code: row.code,
				totalReferrals: row.totalReferrals,
				totalEarnedCents: row.totalEarnedCents,
			};
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			// A collision on `code` retries; a collision on the OWNER means another
			// request created this customer's code first, so read it back.
			const [raced] = await db
				.select()
				.from(referralCodes)
				.where(
					and(
						eq(referralCodes.workspaceId, input.workspaceId),
						eq(referralCodes.ownerClientRecordId, input.clientRecordId),
					),
				)
				.limit(1);
			if (raced) {
				return {
					code: raced.code,
					totalReferrals: raced.totalReferrals,
					totalEarnedCents: raced.totalEarnedCents,
				};
			}
		}
	}
	throw new Error("REFERRAL_CODE_GENERATION_FAILED");
}

/**
 * Crockford-ish base32: no I, L, O or U.
 *
 * Those four are the characters people misread off a screenshot or mishear over
 * the phone, and a referral code exists to be passed between humans.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCode(length = 8): string {
	const bytes = randomBytes(length);
	let out = "";
	for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
	return out;
}

function isUniqueViolation(error: unknown): boolean {
	// Drizzle wraps driver errors, so match SQLSTATE on the cause chain rather
	// than the message. See DB_RULES.
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		if ((current as { code?: string }).code === "23505") return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Can this customer use this code?
 *
 * Read-only. Recording happens in `recordReferral`, once an order exists.
 */
export async function evaluateReferral(input: {
	workspaceId: string;
	code: string;
	referredClientRecordId: string;
	settings: ReferralSettings;
	orderSubtotalCents: number;
}): Promise<ReferralEvaluation> {
	if (!input.settings.enabled) return reject("DISABLED");

	const code = input.code.trim().toUpperCase();
	const [owner] = await db
		.select()
		.from(referralCodes)
		.where(
			and(
				eq(referralCodes.workspaceId, input.workspaceId),
				eq(referralCodes.code, code),
			),
		)
		.limit(1);

	if (!owner) return reject("NOT_FOUND");
	if (owner.ownerClientRecordId === input.referredClientRecordId) {
		return reject("SELF_REFERRAL");
	}

	// One referral per person, ever. Checked here for a clear message and again
	// by a unique index at write time, which is what actually guarantees it.
	const [already] = await db
		.select({ id: referrals.id })
		.from(referrals)
		.where(
			and(
				eq(referrals.workspaceId, input.workspaceId),
				eq(referrals.referredClientRecordId, input.referredClientRecordId),
			),
		)
		.limit(1);
	if (already) return reject("ALREADY_REFERRED");

	return {
		ok: true,
		referralCodeId: owner.id,
		referrerClientRecordId: owner.ownerClientRecordId,
		rewardType: input.settings.rewardType,
		rewardAmountCents: referralRewardCents(
			input.settings,
			input.orderSubtotalCents,
		),
	};
}

/**
 * Record a referral against an order.
 *
 * ⚠️ Created `pending`. The reward is not counted toward the referrer's total
 * until the order settles — paying out on an unpaid order is how a referral
 * programme becomes a way to print money.
 *
 * Returns false rather than throwing if the customer was already referred: two
 * concurrent checkouts both pass `evaluateReferral` and the unique index decides.
 */
export async function recordReferral(input: {
	workspaceId: string;
	referralCodeId: string;
	referrerClientRecordId: string;
	referredClientRecordId: string;
	orderId: string;
	rewardType: "fixed" | "percentage";
	rewardAmountCents: number;
}): Promise<boolean> {
	if (input.referrerClientRecordId === input.referredClientRecordId) {
		return false;
	}
	try {
		await db.insert(referrals).values({
			workspaceId: input.workspaceId,
			referralCodeId: input.referralCodeId,
			referrerClientRecordId: input.referrerClientRecordId,
			referredClientRecordId: input.referredClientRecordId,
			orderId: input.orderId,
			rewardType: input.rewardType,
			rewardAmountCents: input.rewardAmountCents,
			status: "pending",
		});
		return true;
	} catch (error) {
		if (isUniqueViolation(error)) return false;
		throw error;
	}
}

/**
 * Settle a referral once its order is paid.
 *
 * 🔴 The totals move HERE, not at referral time. Conditional on `pending`, so a
 * redelivered settlement event cannot pay the referrer twice.
 */
export async function completeReferralsForOrder(input: {
	workspaceId: string;
	orderId: string;
}): Promise<number> {
	return db.transaction(async (tx) => {
		const settled = await tx
			.update(referrals)
			.set({ status: "completed", completedAt: new Date() })
			.where(
				and(
					eq(referrals.workspaceId, input.workspaceId),
					eq(referrals.orderId, input.orderId),
					eq(referrals.status, "pending"),
				),
			)
			.returning({
				codeId: referrals.referralCodeId,
				reward: referrals.rewardAmountCents,
			});

		for (const row of settled) {
			await tx
				.update(referralCodes)
				.set({
					totalReferrals: sql`${referralCodes.totalReferrals} + 1`,
					totalEarnedCents: sql`${referralCodes.totalEarnedCents} + ${row.reward}`,
				})
				.where(eq(referralCodes.id, row.codeId));
		}
		return settled.length;
	});
}

/**
 * Reverse a referral whose order was cancelled or refunded.
 *
 * Only touches `completed` rows, and subtracts exactly what was added. A
 * `pending` referral never counted, so cancelling one changes no total.
 */
export async function cancelReferralsForOrder(input: {
	workspaceId: string;
	orderId: string;
}): Promise<number> {
	return db.transaction(async (tx) => {
		// 🔴 Read BEFORE updating. `UPDATE ... RETURNING` gives the NEW row, so
		// selecting `status` back after setting it to 'cancelled' would report
		// 'cancelled' for every row — and the "was this completed?" test that
		// decides whether to reverse a credit would never be true. Caught by a test
		// asserting the total went back to zero; it silently stayed at one.
		const affected = await tx
			.select({
				id: referrals.id,
				codeId: referrals.referralCodeId,
				reward: referrals.rewardAmountCents,
				status: referrals.status,
			})
			.from(referrals)
			.where(
				and(
					eq(referrals.workspaceId, input.workspaceId),
					eq(referrals.orderId, input.orderId),
					sql`${referrals.status} in ('pending', 'completed')`,
				),
			);

		if (affected.length === 0) return 0;

		await tx
			.update(referrals)
			.set({ status: "cancelled" })
			// `inArray`, not interpolated SQL. These ids come from our own database
			// so they are safe today, but building an IN clause by string
			// concatenation is the habit that eventually meets a value that is not.
			.where(
				inArray(
					referrals.id,
					affected.map((row) => row.id),
				),
			);

		for (const row of affected) {
			// Only a referral that had been completed contributed to a total.
			if (row.status !== "completed") continue;
			await tx
				.update(referralCodes)
				.set({
					// GREATEST guards against a total going negative if the same order
					// is reversed twice through different paths.
					totalReferrals: sql`greatest(0, ${referralCodes.totalReferrals} - 1)`,
					totalEarnedCents: sql`greatest(0, ${referralCodes.totalEarnedCents} - ${row.reward})`,
				})
				.where(eq(referralCodes.id, row.codeId));
		}
		return affected.length;
	});
}

/** A customer's own code and what it has earned. */
export async function getReferralSummary(input: {
	workspaceId: string;
	clientRecordId: string;
}) {
	const [row] = await db
		.select()
		.from(referralCodes)
		.where(
			and(
				eq(referralCodes.workspaceId, input.workspaceId),
				eq(referralCodes.ownerClientRecordId, input.clientRecordId),
			),
		)
		.limit(1);
	return row ?? null;
}
