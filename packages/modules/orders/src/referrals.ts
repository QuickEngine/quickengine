import { randomBytes } from "node:crypto";
import {
	and,
	clientRecords,
	db,
	desc,
	discounts,
	eq,
	inArray,
	ne,
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
	/**
	 * 🔴 The workspace switch governs CUSTOMER referrals, not partner codes.
	 *
	 * A partner code is a commercial agreement with a named person — they were
	 * promised a percentage and they are owed it. Letting a workspace-wide
	 * "referrals: off" setting silently stop paying somebody the business has a
	 * deal with is not a configuration choice, it is a missed payment. The check
	 * therefore moves below, once the code is known to be a partner code or not.
	 */

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

	/**
	 * A partner code is one issued BY the business to a named partner, and it
	 * carries its own commission. Everything below branches on this, because the
	 * two kinds of code follow genuinely different rules.
	 */
	const isPartner =
		owner.commissionBasisPoints !== null &&
		owner.commissionBasisPoints !== undefined;

	if (!isPartner && !input.settings.enabled) return reject("DISABLED");
	if (isPartner && !owner.active) return reject("NOT_FOUND");

	if (owner.ownerClientRecordId === input.referredClientRecordId) {
		return reject("SELF_REFERRAL");
	}

	/**
	 * 🔴 One referral per person applies to CUSTOMER referrals only.
	 *
	 * "You may be referred once, ever" is right when the reward is a thank-you
	 * for introducing somebody new. It is wrong for a partner: a creator whose
	 * audience buys coffee every month earns on every order, and applying the
	 * customer rule would pay them for a subscriber's first box and nothing
	 * after — quietly, with no error, for as long as the arrangement lasted.
	 */
	if (!isPartner) {
		/**
		 * A customer is BROUGHT once, and that rule stands.
		 *
		 * 🔴 But it used to reject on any existing row, including a `pending` one
		 * from an order that was never paid. A shopper who abandoned at payment
		 * and came back could never be referred again — the first order never
		 * settled so nobody was paid, the second carried no referral, and the
		 * referrer silently lost the reward for the one case where somebody
		 * hesitated.
		 *
		 * ⚠️ So the SAME referrer may try again, and a DIFFERENT one may not.
		 * Alice introduced Bob; Bob's card being declined does not make him
		 * available for Carol to claim. Only a settled reward, or a claim by
		 * somebody else, closes the door.
		 */
		const [already] = await db
			.select({
				id: referrals.id,
				referrerClientRecordId: referrals.referrerClientRecordId,
				status: referrals.status,
			})
			.from(referrals)
			.where(
				and(
					eq(referrals.workspaceId, input.workspaceId),
					eq(referrals.referredClientRecordId, input.referredClientRecordId),
					ne(referrals.status, "cancelled"),
				),
			)
			.limit(1);
		if (
			already &&
			(already.status === "completed" ||
				already.referrerClientRecordId !== owner.ownerClientRecordId)
		) {
			return reject("ALREADY_REFERRED");
		}
	}

	return {
		ok: true,
		referralCodeId: owner.id,
		referrerClientRecordId: owner.ownerClientRecordId,
		rewardType: isPartner ? "percentage" : input.settings.rewardType,
		/**
		 * ⚠️ A partner's own rate wins over the workspace default. They negotiated
		 * a number; reading the workspace setting instead would pay whatever
		 * happened to be configured for ordinary customer referrals — which is
		 * almost never what was agreed, and wrong in silence either way.
		 */
		rewardAmountCents: isPartner
			? partnerCommissionCents(
					input.orderSubtotalCents,
					owner.commissionBasisPoints,
				)
			: referralRewardCents(input.settings, input.orderSubtotalCents),
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
		/**
		 * 🔴 MOVE an unsettled referral to the new order rather than adding one.
		 *
		 * `referrals` is unique on (workspace, customer) — a customer has exactly
		 * one referral, ever. A referral is written at CHECKOUT though, before
		 * payment, so an abandoned attempt leaves a `pending` row pinned to an
		 * order that will never settle. The retry then could not insert, the
		 * reward was attached to the dead order, and the referrer was never paid.
		 *
		 * ⚠️ Only `pending` rows move. A `completed` one has already paid out, and
		 * re-pointing it would pay a second time for the same customer.
		 */
		const [moved] = await db
			.update(referrals)
			.set({
				orderId: input.orderId,
				referralCodeId: input.referralCodeId,
				referrerClientRecordId: input.referrerClientRecordId,
				rewardType: input.rewardType,
				rewardAmountCents: input.rewardAmountCents,
			})
			.where(
				and(
					eq(referrals.workspaceId, input.workspaceId),
					eq(referrals.referredClientRecordId, input.referredClientRecordId),
					eq(referrals.status, "pending"),
				),
			)
			.returning({ id: referrals.id });
		if (moved) return true;

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

// ── Partner codes ───────────────────────────────────────────────────────────

/**
 * ⚠️ Basis points, so 7.5% is 750 and no float ever rounds a payout down.
 *
 * Lives here rather than in the route file because the OpenAPI request table
 * documents it by reference, and a schema that exists in only one of those two
 * places is how the published contract drifts from what the server accepts.
 */
export const partnerLinkSchema = z.object({
	clientRecordId: z.uuid(),
	code: z.string().trim().min(3).max(40),
	commissionBasisPoints: z.number().int().min(0).max(10_000).nullish(),
	discountId: z.uuid().nullish(),
});

/**
 * A code issued BY the business TO a named partner, rather than claimed by a
 * customer for themselves.
 *
 * ── Why this sits beside customer referrals rather than in its own module ────
 *
 * 🔑 Structurally they are the same thing: a client record owns a code, orders
 * placed through it are attributed, and the owner accrues earnings. Building a
 * separate "affiliates" concept would duplicate `referral_codes`, `referrals`,
 * attribution at checkout and every report over them, and then the two would
 * drift the first time one of them gained a feature.
 *
 * What differs is only who chose the code and whether money is owed on it:
 *
 * | | Customer referral | Partner code |
 * |---|---|---|
 * | Code | generated | chosen, and memorable — it becomes a URL |
 * | Commission | none | `commissionBasisPoints` |
 * | Visitor discount | settings-wide | its own `discountId` |
 *
 * ⚠️ The code is handed out as `yoursite.com/<code>`, so it is public by
 * construction and lowercase-friendly. Stored uppercase and matched
 * case-insensitively, exactly like a discount code, because somebody typing it
 * off a screenshot must get the same answer as somebody clicking a link.
 */
export async function issuePartnerCode(input: {
	workspaceId: string;
	clientRecordId: string;
	code: string;
	commissionBasisPoints?: number | null;
	discountId?: string | null;
}) {
	const code = input.code.trim().toUpperCase();
	if (!/^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/.test(code)) {
		// 🔴 Constrained because this becomes a path segment. Anything needing
		// escaping produces a link that breaks when pasted into the one place it
		// matters: somebody's bio.
		throw new Error("REFERRAL_CODE_INVALID");
	}
	try {
		const [row] = await db
			.insert(referralCodes)
			.values({
				workspaceId: input.workspaceId,
				ownerClientRecordId: input.clientRecordId,
				code,
				commissionBasisPoints: input.commissionBasisPoints ?? null,
				discountId: input.discountId ?? null,
			})
			.returning();
		return row;
	} catch (error) {
		if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
			throw new Error("REFERRAL_CODE_TAKEN");
		}
		throw error;
	}
}

/**
 * Resolve a code arriving from a public link.
 *
 * 🔴 Deliberately returns almost nothing: whether the code works, and the
 * discount it carries. It must never expose who owns it, what they earn, or
 * what they have earned so far — this endpoint is reachable by anybody who can
 * guess a code, and a partner's commission is a commercial term between them
 * and the business.
 *
 * ⚠️ An inactive or unknown code returns null rather than an error. A dead link
 * should land somebody on the shop, not on a failure: they came to buy coffee
 * and the state of an affiliate arrangement is not their problem.
 */
export async function resolvePartnerLink(input: {
	workspaceId: string;
	code: string;
}): Promise<{ code: string; discountCode: string | null } | null> {
	const [row] = await db
		.select({
			code: referralCodes.code,
			active: referralCodes.active,
			discountCode: discounts.code,
			discountActive: discounts.active,
		})
		.from(referralCodes)
		.leftJoin(discounts, eq(discounts.id, referralCodes.discountId))
		.where(
			and(
				eq(referralCodes.workspaceId, input.workspaceId),
				eq(referralCodes.code, input.code.trim().toUpperCase()),
			),
		)
		.limit(1);

	if (!row?.active) return null;
	return {
		code: row.code,
		// A retired discount must not keep discounting. The link still attributes.
		discountCode: row.discountActive ? row.discountCode : null,
	};
}

/**
 * What a partner earns on one order, in cents.
 *
 * ⚠️ Calculated on the SUBTOTAL, never the total. Paying commission on shipping
 * and tax means paying a partner a share of money the business never earned —
 * on a heavy parcel that can exceed the margin on the sale itself.
 */
export function partnerCommissionCents(
	subtotalCents: number,
	commissionBasisPoints: number | null | undefined,
): number {
	if (!commissionBasisPoints || commissionBasisPoints <= 0) return 0;
	/**
	 * ⚠️ Rounds DOWN, matching `referralRewardCents` and the tax calculator.
	 *
	 * It used to round to nearest while the reward beside it floored, so the same
	 * "percentage of subtotal" produced different answers a cent apart depending
	 * on which one asked. This is money the business OWES somebody else, and
	 * paying a cent more than the agreed rate is the business's loss to absorb —
	 * so the direction is now deliberate rather than accidental.
	 */
	return Math.floor((subtotalCents * commissionBasisPoints) / 10_000);
}

/**
 * Every partner code in a workspace, with what it has earned.
 *
 * ⚠️ Operator-only, and deliberately the mirror image of `resolvePartnerLink`:
 * that one hides the owner and the commission from the public, this one is
 * mostly those two facts. Two functions rather than one with a flag, so no
 * caller can accidentally hand the private half to a storefront.
 */
export async function listPartnerCodes(workspaceId: string) {
	return db
		.select({
			id: referralCodes.id,
			code: referralCodes.code,
			ownerClientRecordId: referralCodes.ownerClientRecordId,
			ownerName: clientRecords.name,
			commissionBasisPoints: referralCodes.commissionBasisPoints,
			discountId: referralCodes.discountId,
			discountCode: discounts.code,
			totalReferrals: referralCodes.totalReferrals,
			totalEarnedCents: referralCodes.totalEarnedCents,
			active: referralCodes.active,
			createdAt: referralCodes.createdAt,
		})
		.from(referralCodes)
		.innerJoin(
			clientRecords,
			eq(clientRecords.id, referralCodes.ownerClientRecordId),
		)
		.leftJoin(discounts, eq(discounts.id, referralCodes.discountId))
		.where(eq(referralCodes.workspaceId, workspaceId))
		.orderBy(desc(referralCodes.totalReferrals));
}

/** Retire or restore a code without erasing what it already earned. */
export async function setPartnerCodeActive(input: {
	workspaceId: string;
	id: string;
	active: boolean;
}) {
	const [row] = await db
		.update(referralCodes)
		.set({ active: input.active })
		.where(
			and(
				eq(referralCodes.id, input.id),
				eq(referralCodes.workspaceId, input.workspaceId),
			),
		)
		.returning();
	if (!row) throw new Error("REFERRAL_CODE_NOT_FOUND");
	return row;
}
