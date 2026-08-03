import {
	and,
	catalogItems,
	customerWishlistItems,
	db,
	desc,
	eq,
	inArray,
	sql,
} from "@quickengine/db";
import { z } from "zod";

/**
 * A shopper's saved items.
 *
 * 🔴 Scoped by `workspaceCustomerId` — the MEMBERSHIP, not the person. The same
 * shopper saving a gem at one shop and a lamp at another has two lists, and
 * neither shop can see the other's. That falls out of the key rather than
 * needing a workspace filter somebody has to remember on every query.
 *
 * ⚠️ Every write still re-checks that the catalog item belongs to the same
 * workspace as the membership. The membership id alone is not enough: a caller
 * holding a valid session could otherwise save another shop's product and read
 * its name and price back out of their own wishlist.
 */

export const wishlistItemInputSchema = z.object({
	catalogItemId: z.uuid(),
	catalogItemVariantId: z.uuid().nullable().optional(),
});

export type WishlistItemInput = z.infer<typeof wishlistItemInputSchema>;

/**
 * A guest's browser-held list, offered at sign-in.
 *
 * Capped: a list this long is a script, not a shopper, and merging it unbounded
 * would let one request write thousands of rows.
 */
export const wishlistMergeInputSchema = z.object({
	items: z.array(wishlistItemInputSchema).max(200),
});

export type WishlistEntry = {
	catalogItemId: string;
	catalogItemVariantId: string | null;
	name: string;
	priceCents: number | null;
	currency: string;
	status: "draft" | "active" | "archived";
	addedAt: Date;
};

export class WishlistError extends Error {
	constructor(
		readonly code: "ITEM_NOT_FOUND",
		message: string,
	) {
		super(message);
	}
}

/**
 * Confirm the items belong to this workspace, returning the ones that do.
 *
 * Used by both add and merge. Merge tolerates misses (a guest's saved list can
 * reference something since deleted); add does not, because a shopper clicking
 * a heart on a real page should not be told nothing happened.
 */
async function itemsInWorkspace(
	workspaceId: string,
	ids: readonly string[],
): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				inArray(catalogItems.id, [...ids]),
			),
		);
	return new Set(rows.map((row) => row.id));
}

/**
 * Save an item. Idempotent — a double-tapped heart is one entry.
 *
 * The composite primary key does the work; `onConflictDoUpdate` refreshes the
 * chosen variant so tapping "size 7" after "size 6" changes the answer rather
 * than being silently ignored.
 */
export async function addToWishlist(input: {
	workspaceId: string;
	workspaceCustomerId: string;
	item: WishlistItemInput;
}): Promise<void> {
	const parsed = wishlistItemInputSchema.parse(input.item);
	const valid = await itemsInWorkspace(input.workspaceId, [
		parsed.catalogItemId,
	]);
	if (!valid.has(parsed.catalogItemId)) {
		throw new WishlistError("ITEM_NOT_FOUND", "That item is not available.");
	}

	await db
		.insert(customerWishlistItems)
		.values({
			workspaceCustomerId: input.workspaceCustomerId,
			catalogItemId: parsed.catalogItemId,
			catalogItemVariantId: parsed.catalogItemVariantId ?? null,
		})
		.onConflictDoUpdate({
			target: [
				customerWishlistItems.workspaceCustomerId,
				customerWishlistItems.catalogItemId,
			],
			set: { catalogItemVariantId: parsed.catalogItemVariantId ?? null },
		});
}

/** Remove an item. Removing something absent is success, not an error. */
export async function removeFromWishlist(input: {
	workspaceCustomerId: string;
	catalogItemId: string;
}): Promise<void> {
	await db
		.delete(customerWishlistItems)
		.where(
			and(
				eq(
					customerWishlistItems.workspaceCustomerId,
					input.workspaceCustomerId,
				),
				eq(customerWishlistItems.catalogItemId, input.catalogItemId),
			),
		);
}

/**
 * The saved list, with enough of each item to render a card.
 *
 * Joined rather than returning bare ids: a wishlist page showing names and
 * prices would otherwise be one request per saved item, from a browser.
 *
 * ⚠️ Archived items are kept and labelled rather than hidden. A shopper who
 * saved something that has since been withdrawn deserves to see that it is gone,
 * not to find their list quietly shorter.
 */
export async function listWishlist(
	workspaceCustomerId: string,
): Promise<WishlistEntry[]> {
	const rows = await db
		.select({
			catalogItemId: customerWishlistItems.catalogItemId,
			catalogItemVariantId: customerWishlistItems.catalogItemVariantId,
			name: catalogItems.name,
			priceCents: catalogItems.priceCents,
			currency: catalogItems.currency,
			status: catalogItems.status,
			addedAt: customerWishlistItems.createdAt,
		})
		.from(customerWishlistItems)
		.innerJoin(
			catalogItems,
			eq(catalogItems.id, customerWishlistItems.catalogItemId),
		)
		.where(eq(customerWishlistItems.workspaceCustomerId, workspaceCustomerId))
		.orderBy(desc(customerWishlistItems.createdAt));

	return rows;
}

/**
 * Fold a guest's browser-held list into their account at sign-in.
 *
 * 🔴 Additive, never destructive. Somebody who saved three things while signed
 * out and already had five saved ends with eight — replacing the list would
 * throw away what they saved on another device, which is the more valuable half.
 *
 * Unknown or foreign items are skipped rather than failing the whole merge: a
 * list carried in a browser for months will reference something that has since
 * been withdrawn, and refusing the lot over one dead id would lose the rest.
 */
export async function mergeWishlist(input: {
	workspaceId: string;
	workspaceCustomerId: string;
	items: readonly WishlistItemInput[];
}): Promise<{ merged: number; skipped: number }> {
	if (input.items.length === 0) return { merged: 0, skipped: 0 };

	const valid = await itemsInWorkspace(
		input.workspaceId,
		input.items.map((item) => item.catalogItemId),
	);
	const usable = input.items.filter((item) => valid.has(item.catalogItemId));

	if (usable.length > 0) {
		await db
			.insert(customerWishlistItems)
			.values(
				usable.map((item) => ({
					workspaceCustomerId: input.workspaceCustomerId,
					catalogItemId: item.catalogItemId,
					catalogItemVariantId: item.catalogItemVariantId ?? null,
				})),
			)
			// Already saved wins — the stored entry is older and may carry a variant
			// the guest list does not know about.
			.onConflictDoNothing();
	}

	return {
		merged: usable.length,
		skipped: input.items.length - usable.length,
	};
}

/**
 * How many shoppers saved each item.
 *
 * A merchandising signal — what to restock, what to feature. Operator-only:
 * exposing it publicly would let a competitor read demand off a storefront.
 */
export async function wishlistCounts(
	workspaceId: string,
	catalogItemIds: readonly string[],
): Promise<Map<string, number>> {
	if (catalogItemIds.length === 0) return new Map();
	const rows = await db
		.select({
			catalogItemId: customerWishlistItems.catalogItemId,
			total: sql<number>`count(*)::int`,
		})
		.from(customerWishlistItems)
		.innerJoin(
			catalogItems,
			eq(catalogItems.id, customerWishlistItems.catalogItemId),
		)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				inArray(customerWishlistItems.catalogItemId, [...catalogItemIds]),
			),
		)
		.groupBy(customerWishlistItems.catalogItemId);

	return new Map(rows.map((row) => [row.catalogItemId, row.total]));
}
