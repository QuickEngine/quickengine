import {
	and,
	catalogItems,
	clientRecords,
	db,
	desc,
	eq,
	inArray,
	ne,
	orderLineItems,
	orders,
	reviews,
	sql,
	workspaceEnvironment,
} from "@quickengine/db";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS AND MODERATION.
//
// 🔴 Nothing is public until an operator publishes it. Reviews are written as
// `pending`, and every storefront read filters on `published` IN SQL rather than
// after — a moderation queue that leaks its own contents is not a queue.
//
// ⚠️ This is curation, not fabrication. A shop choosing which real reviews to
// feature is ordinary. Nothing here can create a review without a customer
// behind it, and `verifiedPurchase` records whether an order actually backs it,
// so the difference stays visible in the data.
// ─────────────────────────────────────────────────────────────────────────────

export const reviewInputSchema = z.object({
	catalogItemId: z.uuid(),
	rating: z.number().int().min(1).max(5),
	title: z.string().trim().max(160).nullable().optional(),
	// Long enough for a real opinion, bounded so one submission cannot be used to
	// push a novel into the moderation queue.
	body: z.string().trim().max(5_000).nullable().optional(),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewModerationSchema = z.object({
	status: z.enum(["published", "rejected"]),
	/** Internal. Why it was rejected — never shown to the customer. */
	note: z.string().trim().max(1_000).nullable().optional(),
});

export class ReviewError extends Error {
	constructor(
		readonly code: "ITEM_NOT_FOUND" | "ALREADY_REVIEWED",
		message: string,
	) {
		super(message);
	}
}

export type PublicReview = {
	id: string;
	rating: number;
	title: string | null;
	body: string | null;
	authorName: string;
	verifiedPurchase: boolean;
	createdAt: Date;
};

/**
 * How a reviewer is credited publicly.
 *
 * 🔴 First name and last initial. A review page showing "sam.rivera@gmail.com"
 * publishes a customer's email to the internet, and one showing the full name of
 * everyone who bought a personal item is its own problem. This is the smallest
 * thing that still reads as a person.
 */
function displayName(name: string | null): string {
	const trimmed = (name ?? "").trim();
	if (!trimmed) return "Verified customer";
	const [first, ...rest] = trimmed.split(/\s+/);
	const last = rest.at(-1);
	return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/**
 * Leave a review.
 *
 * `verifiedPurchase` is derived HERE, from whether this customer has an order
 * containing this item, and then stored. Deriving it at read time would let a
 * later refund or an archived order silently strip the badge from a review that
 * genuinely earned it.
 */
export async function createReview(input: {
	workspaceId: string;
	clientRecordId: string;
	review: ReviewInput;
}): Promise<{ id: string; status: string; verifiedPurchase: boolean }> {
	const parsed = reviewInputSchema.parse(input.review);

	const [item] = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, input.workspaceId),
				eq(catalogItems.id, parsed.catalogItemId),
			),
		)
		.limit(1);
	if (!item) {
		throw new ReviewError("ITEM_NOT_FOUND", "That item is not available.");
	}

	// Did they actually buy it? Joined through order lines so a review on
	// something they never ordered is still allowed, just not badged.
	const [purchase] = await db
		.select({ orderId: orders.id })
		.from(orders)
		// The real table reference, not a raw SQL fragment. DB_RULES: raw SQL
		// subqueries do not survive the drizzle driver reliably, and a typo in a
		// string is only found at runtime.
		.innerJoin(orderLineItems, eq(orderLineItems.orderId, orders.id))
		.where(
			and(
				eq(orders.workspaceId, input.workspaceId),
				/**
				 * ⚠️ Same mode only. Without this a SANDBOX order badges a live
				 * review as a verified purchase — the badge is a claim to a real
				 * shopper that somebody really bought the thing.
				 */
				eq(orders.environment, await workspaceEnvironment(input.workspaceId)),
				eq(orders.clientId, input.clientRecordId),
				eq(orderLineItems.catalogItemId, parsed.catalogItemId),
				// A cancelled order does not earn a verified badge.
				ne(orders.status, "cancelled"),
			),
		)
		.limit(1);

	try {
		const [row] = await db
			.insert(reviews)
			.values({
				workspaceId: input.workspaceId,
				catalogItemId: parsed.catalogItemId,
				clientRecordId: input.clientRecordId,
				orderId: purchase?.orderId ?? null,
				verifiedPurchase: Boolean(purchase),
				rating: parsed.rating,
				title: parsed.title ?? null,
				body: parsed.body ?? null,
				// 🔴 Always pending. There is no path that publishes on write.
				status: "pending",
			})
			.returning({
				id: reviews.id,
				status: reviews.status,
				verifiedPurchase: reviews.verifiedPurchase,
			});
		return row;
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new ReviewError(
				"ALREADY_REVIEWED",
				"You've already reviewed this item.",
			);
		}
		throw error;
	}
}

function isUniqueViolation(error: unknown): boolean {
	// Drizzle wraps driver errors — match SQLSTATE on the cause chain, not the
	// message. See DB_RULES.
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		if ((current as { code?: string }).code === "23505") return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Published reviews for one product, for a storefront.
 *
 * ⚠️ `status = published` is in the WHERE clause. Filtering after the query
 * would mean pending and rejected reviews travelling to a browser, which is the
 * entire thing this feature exists to prevent.
 */
export async function listPublishedReviews(
	workspaceId: string,
	catalogItemId: string,
	limit = 50,
): Promise<PublicReview[]> {
	const rows = await db
		.select({
			id: reviews.id,
			rating: reviews.rating,
			title: reviews.title,
			body: reviews.body,
			verifiedPurchase: reviews.verifiedPurchase,
			createdAt: reviews.createdAt,
			authorName: clientRecords.name,
		})
		.from(reviews)
		.innerJoin(clientRecords, eq(clientRecords.id, reviews.clientRecordId))
		.where(
			and(
				eq(reviews.workspaceId, workspaceId),
				eq(reviews.catalogItemId, catalogItemId),
				eq(reviews.status, "published"),
			),
		)
		.orderBy(desc(reviews.createdAt))
		.limit(Math.min(Math.max(limit, 1), 200));

	return rows.map((row) => ({
		...row,
		authorName: displayName(row.authorName),
	}));
}

/**
 * The published rating summary a product page shows.
 *
 * 🔴 Averages PUBLISHED reviews only. Including pending ones would show a rating
 * built partly from reviews nobody has approved, which is worse than either
 * extreme: it is neither the honest average nor the curated one.
 */
export async function reviewSummary(
	workspaceId: string,
	catalogItemIds: readonly string[],
): Promise<Map<string, { average: number; count: number }>> {
	if (catalogItemIds.length === 0) return new Map();
	const rows = await db
		.select({
			catalogItemId: reviews.catalogItemId,
			count: sql<number>`count(*)::int`,
			// Rounded to one decimal in SQL so every caller shows the same number.
			average: sql<number>`round(avg(${reviews.rating})::numeric, 1)::float8`,
		})
		.from(reviews)
		.where(
			and(
				eq(reviews.workspaceId, workspaceId),
				eq(reviews.status, "published"),
				inArray(reviews.catalogItemId, [...catalogItemIds]),
			),
		)
		.groupBy(reviews.catalogItemId);

	return new Map(
		rows.map((row) => [
			row.catalogItemId,
			{ average: row.average, count: row.count },
		]),
	);
}

/**
 * The moderation queue.
 *
 * Operator-only, and the only place an unpublished review is visible. Oldest
 * first, deliberately: a queue worked newest-first leaves the oldest complaint
 * sitting there longest.
 */
export async function listReviewsForModeration(
	workspaceId: string,
	options: {
		status?: "pending" | "published" | "rejected";
		limit?: number;
	} = {},
) {
	return db
		.select({
			id: reviews.id,
			catalogItemId: reviews.catalogItemId,
			itemName: catalogItems.name,
			rating: reviews.rating,
			title: reviews.title,
			body: reviews.body,
			status: reviews.status,
			verifiedPurchase: reviews.verifiedPurchase,
			authorName: clientRecords.name,
			authorEmail: clientRecords.email,
			moderatedByUserId: reviews.moderatedByUserId,
			moderatedAt: reviews.moderatedAt,
			moderationNote: reviews.moderationNote,
			createdAt: reviews.createdAt,
		})
		.from(reviews)
		.innerJoin(catalogItems, eq(catalogItems.id, reviews.catalogItemId))
		.innerJoin(clientRecords, eq(clientRecords.id, reviews.clientRecordId))
		.where(
			and(
				eq(reviews.workspaceId, workspaceId),
				eq(reviews.status, options.status ?? "pending"),
			),
		)
		.orderBy(reviews.createdAt)
		.limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
}

/**
 * Publish or reject one review.
 *
 * ⚠️ Records WHO decided and when. A shop curating its own reviews should leave
 * a trail — for its own disputes as much as anyone else's.
 */
export async function moderateReview(input: {
	workspaceId: string;
	reviewId: string;
	status: "published" | "rejected";
	moderatedByUserId: string;
	note?: string | null;
}): Promise<boolean> {
	const rows = await db
		.update(reviews)
		.set({
			status: input.status,
			moderatedByUserId: input.moderatedByUserId,
			moderatedAt: new Date(),
			moderationNote: input.note ?? null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(reviews.workspaceId, input.workspaceId),
				eq(reviews.id, input.reviewId),
			),
		)
		.returning({ id: reviews.id });
	return rows.length > 0;
}

/** A customer's own reviews, including ones still awaiting a decision. */
export async function listOwnReviews(
	workspaceId: string,
	clientRecordId: string,
) {
	return db
		.select({
			id: reviews.id,
			catalogItemId: reviews.catalogItemId,
			rating: reviews.rating,
			title: reviews.title,
			body: reviews.body,
			// Shown so somebody can see their review is waiting rather than assuming
			// it vanished.
			status: reviews.status,
			verifiedPurchase: reviews.verifiedPurchase,
			createdAt: reviews.createdAt,
		})
		.from(reviews)
		.where(
			and(
				eq(reviews.workspaceId, workspaceId),
				eq(reviews.clientRecordId, clientRecordId),
			),
		)
		.orderBy(desc(reviews.createdAt));
}

/**
 * Rating summaries for a batch of products.
 *
 * Lives here rather than in the route so the OpenAPI document and the handler
 * import the same object and cannot drift.
 */
export const reviewSummaryInputSchema = z.object({
	catalogItemIds: z.array(z.uuid()).min(1).max(200),
});
