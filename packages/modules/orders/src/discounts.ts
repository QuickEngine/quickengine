import {
	and,
	DISCOUNT_VALUE_TYPES,
	db,
	discountRedemptions,
	discounts,
	eq,
	sql,
} from "@quickengine/db";
import { z } from "zod";
import { checkoutItemSchema } from "./checkout";

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT CODES.
//
// 🔴 The arithmetic is pure and lives at the top of this file, separately from
// anything that touches a database. Money maths is the part worth being able to
// test exhaustively, and mixing it with IO is how a rounding bug ends up only
// reproducible against a live row.
// ─────────────────────────────────────────────────────────────────────────────

export const discountInputSchema = z.object({
	name: z.string().trim().min(1).max(160),
	code: z
		.string()
		.trim()
		.min(3)
		.max(40)
		// Letters, numbers, dashes. No spaces — a code somebody has to type into a
		// phone keyboard with a space in it is a support ticket.
		.regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
			message: "A code is letters, numbers and dashes.",
		}),
	valueType: z.enum(DISCOUNT_VALUE_TYPES),
	// Bounded at 100% / a very large fixed amount. An unbounded percentage is a
	// typo that pays the customer.
	value: z.number().int().min(1).max(10_000),
	minimumSubtotalCents: z.number().int().min(0).max(1_000_000_000).optional(),
	maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
	maxRedemptionsPerCustomer: z
		.number()
		.int()
		.min(1)
		.max(1_000)
		.nullable()
		.optional(),
	startsAt: z.coerce.date().nullable().optional(),
	endsAt: z.coerce.date().nullable().optional(),
	active: z.boolean().optional(),
});

export type DiscountInput = z.infer<typeof discountInputSchema>;

export type DiscountRejection =
	| "NOT_FOUND"
	| "INACTIVE"
	| "NOT_STARTED"
	| "EXPIRED"
	| "BELOW_MINIMUM"
	| "FULLY_REDEEMED"
	| "CUSTOMER_LIMIT_REACHED";

export type DiscountEvaluation =
	| { ok: true; discountId: string; code: string; amountCents: number }
	| { ok: false; reason: DiscountRejection; message: string };

/**
 * What this code takes off a given subtotal.
 *
 * ⚠️ Rounds DOWN, and never exceeds the subtotal. Rounding up gives away money
 * the shop did not agree to; letting a fixed discount exceed the subtotal turns
 * an order into a refund, which is a genuine way to lose money to a typo.
 */
export function discountAmountCents(
	discount: { valueType: string; value: number },
	subtotalCents: number,
): number {
	if (subtotalCents <= 0) return 0;
	const raw =
		discount.valueType === "percentage"
			? Math.floor((subtotalCents * discount.value) / 10_000)
			: discount.value;
	return Math.max(0, Math.min(raw, subtotalCents));
}

/**
 * Why a code cannot be used, phrased for a shopper.
 *
 * ⚠️ "Not found" and "expired" say different things ON PURPOSE. A shopper who
 * mistyped needs to know it is the wrong code; one whose code has run out needs
 * to stop trying. This is not an enumeration surface — a discount code is
 * something the shop hands out publicly, unlike an account.
 */
const REJECTION_MESSAGE: Record<DiscountRejection, string> = {
	NOT_FOUND: "That code isn't recognised.",
	INACTIVE: "That code is no longer available.",
	NOT_STARTED: "That code isn't active yet.",
	EXPIRED: "That code has expired.",
	BELOW_MINIMUM: "Your order doesn't reach the minimum for that code.",
	FULLY_REDEEMED: "That code has been fully claimed.",
	CUSTOMER_LIMIT_REACHED: "You've already used that code.",
};

function reject(reason: DiscountRejection): DiscountEvaluation {
	return { ok: false, reason, message: REJECTION_MESSAGE[reason] };
}

/**
 * Can this code be used, and for how much?
 *
 * 🔴 `subtotalCents` is computed by the CALLER from the catalog, never sent by a
 * browser. The old prototype's storefront API took a subtotal in the request
 * body, which lets anyone claim a £10,000 order to clear a minimum-spend
 * threshold — or, with a percentage code, to compute a discount against a number
 * they invented.
 *
 * Read-only: this decides nothing and records nothing. Redemption happens in
 * `redeemDiscountInTx`, inside the order's transaction.
 */
export async function evaluateDiscount(input: {
	workspaceId: string;
	code: string;
	subtotalCents: number;
	clientRecordId?: string | null;
	now?: Date;
}): Promise<DiscountEvaluation> {
	const now = input.now ?? new Date();
	const code = input.code.trim().toUpperCase();

	const [discount] = await db
		.select()
		.from(discounts)
		.where(
			and(
				eq(discounts.workspaceId, input.workspaceId),
				eq(discounts.code, code),
			),
		)
		.limit(1);

	if (!discount) return reject("NOT_FOUND");
	if (!discount.active) return reject("INACTIVE");
	if (discount.startsAt && discount.startsAt > now)
		return reject("NOT_STARTED");
	if (discount.endsAt && discount.endsAt <= now) return reject("EXPIRED");
	if (input.subtotalCents < discount.minimumSubtotalCents) {
		return reject("BELOW_MINIMUM");
	}
	if (
		discount.maxRedemptions !== null &&
		discount.timesRedeemed >= discount.maxRedemptions
	) {
		return reject("FULLY_REDEEMED");
	}

	// The per-customer cap needs a known customer. An anonymous preview cannot be
	// checked against it and is allowed through here — `redeemDiscountInTx`
	// re-checks with the client record resolved, which is the point that matters.
	if (discount.maxRedemptionsPerCustomer !== null && input.clientRecordId) {
		const [used] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(discountRedemptions)
			.where(
				and(
					eq(discountRedemptions.discountId, discount.id),
					eq(discountRedemptions.clientRecordId, input.clientRecordId),
				),
			);
		if ((used?.total ?? 0) >= discount.maxRedemptionsPerCustomer) {
			return reject("CUSTOMER_LIMIT_REACHED");
		}
	}

	return {
		ok: true,
		discountId: discount.id,
		code: discount.code,
		amountCents: discountAmountCents(discount, input.subtotalCents),
	};
}

/**
 * Spend one use of a code, inside the order's transaction.
 *
 * 🔴 The redemption counter is incremented with a CONDITIONAL UPDATE rather than
 * a read-then-write. Two shoppers spending the last use of a code at the same
 * moment both read `timesRedeemed = 9` against a max of 10, and both would
 * write 10 — overselling the code. `where times_redeemed < max` makes the
 * database arbitrate, and the loser gets zero rows back.
 *
 * ⚠️ Must be called with the SAME transaction that writes the order. Outside
 * it, a failed order would still burn a redemption.
 */
export async function redeemDiscountInTx(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	input: {
		workspaceId: string;
		discountId: string;
		clientRecordId: string | null;
		orderId: string;
		amountCents: number;
	},
): Promise<boolean> {
	const claimed = await tx
		.update(discounts)
		.set({
			timesRedeemed: sql`${discounts.timesRedeemed} + 1`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(discounts.id, input.discountId),
				eq(discounts.workspaceId, input.workspaceId),
				// Null max means unlimited, so the guard only applies when one is set.
				sql`(${discounts.maxRedemptions} is null or ${discounts.timesRedeemed} < ${discounts.maxRedemptions})`,
			),
		)
		.returning({ id: discounts.id });

	if (claimed.length === 0) return false;

	await tx.insert(discountRedemptions).values({
		discountId: input.discountId,
		workspaceId: input.workspaceId,
		clientRecordId: input.clientRecordId,
		orderId: input.orderId,
		amountCents: input.amountCents,
	});
	return true;
}

// ── Operator CRUD ──────────────────────────────────────────────────────────

export async function createDiscount(
	workspaceId: string,
	input: DiscountInput,
): Promise<typeof discounts.$inferSelect> {
	const parsed = discountInputSchema.parse(input);
	assertSaneWindow(parsed);
	const [row] = await db
		.insert(discounts)
		.values({
			workspaceId,
			name: parsed.name,
			// Uppercased on write so lookup is a plain equality rather than a
			// function call that cannot use the unique index.
			code: parsed.code.toUpperCase(),
			valueType: parsed.valueType,
			value: parsed.value,
			minimumSubtotalCents: parsed.minimumSubtotalCents ?? 0,
			maxRedemptions: parsed.maxRedemptions ?? null,
			maxRedemptionsPerCustomer: parsed.maxRedemptionsPerCustomer ?? null,
			startsAt: parsed.startsAt ?? null,
			endsAt: parsed.endsAt ?? null,
			active: parsed.active ?? true,
		})
		.returning();
	return row;
}

export async function listDiscounts(workspaceId: string) {
	return db
		.select()
		.from(discounts)
		.where(eq(discounts.workspaceId, workspaceId))
		.orderBy(discounts.code);
}

export async function updateDiscount(
	workspaceId: string,
	id: string,
	input: Partial<DiscountInput>,
) {
	const parsed = discountInputSchema.partial().parse(input);
	assertSaneWindow(parsed);
	const [row] = await db
		.update(discounts)
		.set({
			...(parsed.name !== undefined ? { name: parsed.name } : {}),
			...(parsed.code !== undefined ? { code: parsed.code.toUpperCase() } : {}),
			...(parsed.valueType !== undefined
				? { valueType: parsed.valueType }
				: {}),
			...(parsed.value !== undefined ? { value: parsed.value } : {}),
			...(parsed.minimumSubtotalCents !== undefined
				? { minimumSubtotalCents: parsed.minimumSubtotalCents }
				: {}),
			...(parsed.maxRedemptions !== undefined
				? { maxRedemptions: parsed.maxRedemptions }
				: {}),
			...(parsed.maxRedemptionsPerCustomer !== undefined
				? { maxRedemptionsPerCustomer: parsed.maxRedemptionsPerCustomer }
				: {}),
			...(parsed.startsAt !== undefined ? { startsAt: parsed.startsAt } : {}),
			...(parsed.endsAt !== undefined ? { endsAt: parsed.endsAt } : {}),
			...(parsed.active !== undefined ? { active: parsed.active } : {}),
			updatedAt: new Date(),
		})
		.where(and(eq(discounts.workspaceId, workspaceId), eq(discounts.id, id)))
		.returning();
	return row ?? null;
}

/**
 * Delete a code.
 *
 * Redemptions survive by FK — `discount_redemptions.discount_id` cascades, so
 * this DOES remove the history. That is deliberate for a code that was created
 * by mistake; a code that has been used should be deactivated instead, which is
 * what the UI should steer toward.
 */
export async function deleteDiscount(workspaceId: string, id: string) {
	const rows = await db
		.delete(discounts)
		.where(and(eq(discounts.workspaceId, workspaceId), eq(discounts.id, id)))
		.returning({ id: discounts.id });
	return rows.length > 0;
}

/** A window that ends before it starts is a typo, not a discount. */
function assertSaneWindow(input: {
	startsAt?: Date | null;
	endsAt?: Date | null;
}) {
	if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
		throw new Error("DISCOUNT_WINDOW_INVALID");
	}
}

/**
 * Spend a redemption outside a caller-owned transaction.
 *
 * ⚠️ Prefer `redeemDiscountInTx` where the caller controls the transaction. This
 * exists because `createOrderCommand` owns its own unit of work and does not
 * accept extra work inside it — see the note at the call site in
 * `checkout-routes.ts` for the trade-off that creates.
 */
export async function redeemDiscount(input: {
	workspaceId: string;
	discountId: string;
	clientRecordId: string | null;
	orderId: string;
	amountCents: number;
}): Promise<boolean> {
	return db.transaction((tx) => redeemDiscountInTx(tx, input));
}

/** Partial update. Every field optional; absent means "leave it alone". */
export const discountPatchSchema = discountInputSchema.partial();

/**
 * A storefront asking what a code is worth.
 *
 * 🔴 Carries the BASKET, not a subtotal — see `evaluateDiscount` for why a
 * caller-supplied subtotal is a way to steal.
 */
export const discountPreviewInputSchema = z.object({
	code: z.string().trim().min(3).max(40),
	items: z.array(checkoutItemSchema).min(1).max(100),
});
