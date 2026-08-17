import {
	and,
	asc,
	catalogCategories,
	catalogItemCategories,
	catalogItems,
	db,
	eq,
	inArray,
	sql,
} from "@quickengine/db";
import { z } from "zod";

/**
 * Catalog browsing structure — categories and collections.
 *
 * 🔴 Deliberately part of Products & Services rather than a module of its own.
 * `MODULES.md` says not to inflate the registry, and a category is not a
 * business capability — it is how a catalog is arranged. A shop enabling
 * Products gets browsing with it, rather than discovering that its items cannot
 * be grouped until it enables a seventeenth thing.
 */

const slugSchema = z
	.string()
	.trim()
	.min(1)
	.max(120)
	.regex(/^[a-z0-9][a-z0-9-]*$/, {
		message: "A slug is lowercase letters, numbers and dashes.",
	});

export const categoryInputSchema = z.object({
	kind: z.enum(["category", "collection"]).default("category"),
	name: z.string().trim().min(1).max(160),
	slug: slugSchema,
	description: z.string().trim().max(2_000).nullable().optional(),
	parentId: z.uuid().nullable().optional(),
	sortOrder: z.number().int().min(-10_000).max(10_000).optional(),
	imageUrl: z.string().trim().max(2_048).nullable().optional(),
	featured: z.boolean().optional(),
	visible: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

/**
 * Is this a unique-constraint violation?
 *
 * 🔴 Walks the CAUSE CHAIN and matches on Postgres's SQLSTATE, not on prose.
 * Drizzle wraps a driver error in `DrizzleQueryError` whose message is
 * "Failed query: insert into ..." — the constraint text lives on `.cause`, so a
 * `/duplicate/.test(error.message)` check silently never fires and the caller
 * gets a 500 where it should get "that address is taken".
 *
 * 23505 is unique_violation. It is stable across Postgres versions in a way that
 * an English message is not.
 */
function isUniqueViolation(error: unknown): boolean {
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		if ((current as { code?: string }).code === "23505") return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

export class CategoryError extends Error {
	constructor(
		readonly code:
			| "CATEGORY_NOT_FOUND"
			| "CATEGORY_SLUG_TAKEN"
			| "CATEGORY_PARENT_INVALID"
			| "CATEGORY_CYCLE",
		message: string,
	) {
		super(message);
	}
}

export type CategoryNode = {
	id: string;
	kind: "category" | "collection";
	name: string;
	slug: string;
	description: string | null;
	parentId: string | null;
	sortOrder: number;
	imageUrl: string | null;
	featured: boolean;
	visible: boolean;
	itemCount: number;
	children: CategoryNode[];
};

/**
 * A parent must exist, belong to this workspace, and not be a descendant of the
 * category being moved.
 *
 * 🔴 The cycle check is the one that matters. Setting A's parent to its own
 * child makes a loop that no tree walk terminates on, and the first symptom is a
 * storefront navigation render that never returns.
 */
async function assertParentIsSafe(
	workspaceId: string,
	categoryId: string | null,
	parentId: string,
): Promise<void> {
	const [parent] = await db
		.select({ id: catalogCategories.id, parentId: catalogCategories.parentId })
		.from(catalogCategories)
		.where(
			and(
				eq(catalogCategories.workspaceId, workspaceId),
				eq(catalogCategories.id, parentId),
			),
		)
		.limit(1);

	if (!parent) {
		throw new CategoryError(
			"CATEGORY_PARENT_INVALID",
			"That parent category does not exist.",
		);
	}
	if (categoryId && parent.id === categoryId) {
		throw new CategoryError(
			"CATEGORY_CYCLE",
			"A category cannot contain itself.",
		);
	}
	if (!categoryId) return;

	// Walk up from the proposed parent. Bounded, because a pre-existing loop from
	// a hand-edited row must not hang this check either.
	let cursor: string | null = parent.parentId;
	for (let depth = 0; cursor && depth < 50; depth += 1) {
		if (cursor === categoryId) {
			throw new CategoryError(
				"CATEGORY_CYCLE",
				"That would put a category inside one of its own children.",
			);
		}
		const [next] = await db
			.select({ parentId: catalogCategories.parentId })
			.from(catalogCategories)
			.where(eq(catalogCategories.id, cursor))
			.limit(1);
		cursor = next?.parentId ?? null;
	}
}

export async function createCategory(
	workspaceId: string,
	input: CategoryInput,
): Promise<CategoryNode> {
	const parsed = categoryInputSchema.parse(input);
	if (parsed.parentId) {
		await assertParentIsSafe(workspaceId, null, parsed.parentId);
	}

	try {
		const [row] = await db
			.insert(catalogCategories)
			.values({
				workspaceId,
				kind: parsed.kind,
				name: parsed.name,
				slug: parsed.slug,
				description: parsed.description ?? null,
				parentId: parsed.parentId ?? null,
				sortOrder: parsed.sortOrder ?? 0,
				imageUrl: parsed.imageUrl ?? null,
				featured: parsed.featured ?? false,
				visible: parsed.visible ?? true,
			})
			.returning();
		return { ...row, itemCount: 0, children: [] };
	} catch (error) {
		// The unique index is scoped to the workspace, so this only ever means the
		// slug is taken within THIS shop.
		if (isUniqueViolation(error)) {
			throw new CategoryError(
				"CATEGORY_SLUG_TAKEN",
				"Another category already uses that address.",
			);
		}
		throw error;
	}
}

export async function updateCategory(
	workspaceId: string,
	id: string,
	input: Partial<CategoryInput>,
): Promise<CategoryNode> {
	const parsed = categoryInputSchema.partial().parse(input);
	if (parsed.parentId) {
		await assertParentIsSafe(workspaceId, id, parsed.parentId);
	}

	const [row] = await db
		.update(catalogCategories)
		.set({
			...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
			...(parsed.name !== undefined ? { name: parsed.name } : {}),
			...(parsed.slug !== undefined ? { slug: parsed.slug } : {}),
			...(parsed.description !== undefined
				? { description: parsed.description }
				: {}),
			...(parsed.parentId !== undefined ? { parentId: parsed.parentId } : {}),
			...(parsed.sortOrder !== undefined
				? { sortOrder: parsed.sortOrder }
				: {}),
			...(parsed.imageUrl !== undefined ? { imageUrl: parsed.imageUrl } : {}),
			...(parsed.featured !== undefined ? { featured: parsed.featured } : {}),
			...(parsed.visible !== undefined ? { visible: parsed.visible } : {}),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(catalogCategories.workspaceId, workspaceId),
				eq(catalogCategories.id, id),
			),
		)
		.returning();

	if (!row) {
		throw new CategoryError("CATEGORY_NOT_FOUND", "No such category.");
	}
	return { ...row, itemCount: 0, children: [] };
}

/**
 * Delete a category. Children are re-parented, never orphaned.
 *
 * 🔴 The FK says `on delete set null`, so deleting "Jewellery" would silently
 * move "Rings" to the top level. Lifting children to the deleted node's own
 * parent keeps the tree's shape instead — a shop reorganising should not find
 * its nesting flattened.
 */
export async function deleteCategory(
	workspaceId: string,
	id: string,
): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [target] = await tx
			.select({ parentId: catalogCategories.parentId })
			.from(catalogCategories)
			.where(
				and(
					eq(catalogCategories.workspaceId, workspaceId),
					eq(catalogCategories.id, id),
				),
			)
			.limit(1);
		if (!target) return false;

		await tx
			.update(catalogCategories)
			.set({ parentId: target.parentId })
			.where(
				and(
					eq(catalogCategories.workspaceId, workspaceId),
					eq(catalogCategories.parentId, id),
				),
			);

		await tx
			.delete(catalogCategories)
			.where(
				and(
					eq(catalogCategories.workspaceId, workspaceId),
					eq(catalogCategories.id, id),
				),
			);
		return true;
	});
}

/**
 * The browsable tree.
 *
 * `visibleOnly` is what a storefront passes: a hidden category and everything
 * beneath it disappear from navigation without being deleted, so a seasonal
 * collection survives being taken down.
 */
export async function listCategoryTree(
	workspaceId: string,
	options: {
		kind?: "category" | "collection";
		visibleOnly?: boolean;
	} = {},
): Promise<CategoryNode[]> {
	const rows = await db
		.select()
		.from(catalogCategories)
		.where(
			and(
				eq(catalogCategories.workspaceId, workspaceId),
				options.kind ? eq(catalogCategories.kind, options.kind) : undefined,
				options.visibleOnly ? eq(catalogCategories.visible, true) : undefined,
			),
		)
		.orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name));

	// One grouped count rather than a query per category, which is the difference
	// between a shop with forty categories loading its navigation in one round
	// trip or forty-one.
	const counts = new Map<string, number>();
	if (rows.length > 0) {
		const countRows = await db
			.select({
				categoryId: catalogItemCategories.categoryId,
				total: sql<number>`count(*)::int`,
			})
			.from(catalogItemCategories)
			.where(
				inArray(
					catalogItemCategories.categoryId,
					rows.map((row) => row.id),
				),
			)
			.groupBy(catalogItemCategories.categoryId);
		for (const row of countRows) counts.set(row.categoryId, row.total);
	}

	const nodes = new Map<string, CategoryNode>();
	for (const row of rows) {
		nodes.set(row.id, {
			...row,
			itemCount: counts.get(row.id) ?? 0,
			children: [],
		});
	}

	const roots: CategoryNode[] = [];
	for (const node of nodes.values()) {
		// A child whose parent was filtered out (hidden, or a different kind)
		// becomes a root rather than vanishing — dropping it would hide items that
		// are themselves perfectly visible.
		const parent = node.parentId ? nodes.get(node.parentId) : undefined;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	return roots;
}

/** Replace an item's categories in one call. */
export async function setItemCategories(
	workspaceId: string,
	catalogItemId: string,
	categoryIds: readonly string[],
): Promise<number> {
	return db.transaction(async (tx) => {
		const [item] = await tx
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, workspaceId),
					eq(catalogItems.id, catalogItemId),
				),
			)
			.limit(1);
		if (!item) {
			throw new CategoryError("CATEGORY_NOT_FOUND", "No such catalog item.");
		}

		// 🔴 Every category verified against the workspace before linking. Without
		// this a caller could file its item under another shop's collection, which
		// would then render on that shop's storefront.
		const valid = categoryIds.length
			? await tx
					.select({ id: catalogCategories.id })
					.from(catalogCategories)
					.where(
						and(
							eq(catalogCategories.workspaceId, workspaceId),
							inArray(catalogCategories.id, [...categoryIds]),
						),
					)
			: [];

		if (valid.length !== categoryIds.length) {
			throw new CategoryError(
				"CATEGORY_NOT_FOUND",
				"One of those categories does not exist.",
			);
		}

		await tx
			.delete(catalogItemCategories)
			.where(eq(catalogItemCategories.catalogItemId, catalogItemId));

		if (valid.length > 0) {
			await tx.insert(catalogItemCategories).values(
				valid.map((category, index) => ({
					catalogItemId,
					categoryId: category.id,
					sortOrder: index,
				})),
			);
		}
		return valid.length;
	});
}

/** The catalog item ids in a category, for a storefront listing page. */
export async function listCategoryItemIds(
	workspaceId: string,
	slug: string,
): Promise<string[]> {
	const [category] = await db
		.select({ id: catalogCategories.id })
		.from(catalogCategories)
		.where(
			and(
				eq(catalogCategories.workspaceId, workspaceId),
				eq(catalogCategories.slug, slug),
				eq(catalogCategories.visible, true),
			),
		)
		.limit(1);
	if (!category) return [];

	const rows = await db
		.select({ id: catalogItemCategories.catalogItemId })
		.from(catalogItemCategories)
		.where(eq(catalogItemCategories.categoryId, category.id))
		.orderBy(asc(catalogItemCategories.sortOrder));
	return rows.map((row) => row.id);
}

/**
 * Which categories one item is filed under.
 *
 * 🔴 The read that `setItemCategories` never had. Membership could be REPLACED
 * but never read back, so the only way to learn where an item sat was to walk
 * every category asking for its items and invert the result — which no operator
 * screen can reasonably do. An editor that cannot show current state before
 * changing it is an editor that silently discards what it did not know about.
 *
 * ⚠️ Unlike `listCategoryItemIds`, this does NOT filter to visible categories.
 * That one answers a storefront's question; this one answers the operator's,
 * and hiding a hidden category here would make it invisible in the very screen
 * used to take an item out of it.
 */
export async function listItemCategoryIds(
	workspaceId: string,
	catalogItemId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: catalogItemCategories.categoryId })
		.from(catalogItemCategories)
		.innerJoin(
			catalogCategories,
			eq(catalogItemCategories.categoryId, catalogCategories.id),
		)
		.where(
			and(
				// Scoped by workspace through the category, so an id guessed from
				// another shop returns nothing rather than leaking that it exists.
				eq(catalogCategories.workspaceId, workspaceId),
				eq(catalogItemCategories.catalogItemId, catalogItemId),
			),
		)
		.orderBy(asc(catalogItemCategories.sortOrder));
	return rows.map((row) => row.id);
}

/** Partial update. Every field optional; absent means "leave it alone". */
export const categoryPatchSchema = categoryInputSchema.partial();

/**
 * Which categories an item belongs to.
 *
 * Capped at 50 — an item in more than that is a tagging system, not a catalog
 * structure, and would make every category page render slower for everyone.
 */
export const itemCategoriesInputSchema = z.object({
	categoryIds: z.array(z.uuid()).max(50),
});
