import {
	and,
	asc,
	catalogItems,
	db,
	eq,
	isNull,
	supplierSkus,
	suppliers,
	workspaceCurrency,
} from "@quickengine/db";
import { z } from "zod";

/**
 * Suppliers, and the map from what a business sells to what its supplier calls
 * the same thing.
 *
 * ── Why this lives in Inventory ──────────────────────────────────────────────
 *
 * A supplier only matters to a business that does not make its own product, and
 * that is the same business that tracks stock. Putting it here rather than in a
 * module of its own means nothing extra to switch on, and it reads where
 * somebody would look for it: Inventory is already the answer to "where does my
 * stock come from".
 *
 * 🔴 Nothing here sends an order anywhere. This records the RELATIONSHIP so a
 * person can place one by hand today, and so an adapter has somewhere to read
 * from when the supplier's preferred handoff is known. Building the adapter
 * first would mean guessing the supplier's format, and a guess costs a rebuild.
 */

export const supplierInputSchema = z.object({
	name: z.string().trim().min(1).max(200),
	contactName: z.string().trim().max(200).nullish(),
	contactEmail: z.email().nullish(),
	contactPhone: z.string().trim().max(60).nullish(),
	handoffMethod: z
		.enum([
			"unknown",
			"manual",
			"email",
			"csv",
			"api",
			"portal",
			"shopify",
			"woocommerce",
		])
		.default("unknown"),
	handoffTarget: z.string().trim().max(500).nullish(),
	leadTimeDays: z.number().int().min(0).max(365).nullish(),
	notes: z.string().trim().max(5000).nullish(),
	/**
	 * Let SANDBOX orders reach this supplier.
	 *
	 * ⚠️ Only for a supplier who has agreed to receive rehearsals. What they get
	 * is marked as a test in its subject and body, but the real protection is
	 * that somebody asked them first.
	 */
	sandboxHandoffEnabled: z.boolean().optional(),
});

export const supplierPatchSchema = supplierInputSchema.partial().extend({
	archived: z.boolean().optional(),
});

export const supplierSkuInputSchema = z.object({
	supplierId: z.uuid(),
	catalogItemId: z.uuid(),
	supplierSku: z.string().trim().min(1).max(120),
	supplierName: z.string().trim().max(200).nullish(),
	/** Integer cents, matching every other money value in this schema. */
	unitCostCents: z.number().int().min(0).nullish(),
	/**
	 * 🔴 NO DEFAULT. It used to default to `"USD"`, and a supplier SKU whose
	 * currency does not match its product is SKIPPED at checkout rather than
	 * converted — so the supplier is never paid and nothing reports it. A
	 * default that silently disables payment is worse than an absent value.
	 * Left out, it is filled from the WORKSPACE's currency on write.
	 */
	currency: z.string().trim().length(3).optional(),
	leadTimeDays: z.number().int().min(0).max(365).nullish(),
});

export const supplierSkuPatchSchema = supplierSkuInputSchema
	.omit({ supplierId: true, catalogItemId: true })
	.partial();

export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierSkuInput = z.infer<typeof supplierSkuInputSchema>;

/** Raised with a code, never a message — copy changes, codes are contract. */
export class SupplierError extends Error {
	constructor(public readonly code: string) {
		super(code);
		this.name = "SupplierError";
	}
}

export async function listSuppliers(workspaceId: string) {
	return db
		.select()
		.from(suppliers)
		.where(
			and(eq(suppliers.workspaceId, workspaceId), isNull(suppliers.archivedAt)),
		)
		.orderBy(asc(suppliers.name));
}

export async function createSupplier(
	workspaceId: string,
	input: SupplierInput,
) {
	const [row] = await db
		.insert(suppliers)
		.values({ ...input, workspaceId })
		.returning();
	return row;
}

export async function updateSupplier(
	workspaceId: string,
	id: string,
	patch: z.infer<typeof supplierPatchSchema>,
) {
	const { archived, ...fields } = patch;
	const [row] = await db
		.update(suppliers)
		.set({
			...fields,
			...(archived === undefined
				? {}
				: { archivedAt: archived ? new Date() : null }),
			updatedAt: new Date(),
		})
		.where(and(eq(suppliers.id, id), eq(suppliers.workspaceId, workspaceId)))
		.returning();
	if (!row) throw new SupplierError("SUPPLIER_NOT_FOUND");
	return row;
}

/**
 * Archived, never deleted.
 *
 * 🔴 An order already sent to a supplier must keep naming who fulfilled it. A
 * hard delete would leave historical orders pointing at nothing, which is how a
 * dispute becomes unanswerable months later.
 */
export async function archiveSupplier(workspaceId: string, id: string) {
	return updateSupplier(workspaceId, id, { archived: true });
}

/**
 * Every mapping for a workspace, with the catalog item's own name alongside.
 *
 * 🔑 Joined rather than fetched separately: the whole point of the screen is
 * comparing "what I call it" against "what they call it", and two round trips
 * would let those two lists disagree for a frame.
 */
export async function listSupplierSkus(
	workspaceId: string,
	supplierId?: string,
) {
	return db
		.select({
			id: supplierSkus.id,
			supplierId: supplierSkus.supplierId,
			catalogItemId: supplierSkus.catalogItemId,
			catalogItemName: catalogItems.name,
			supplierSku: supplierSkus.supplierSku,
			supplierName: supplierSkus.supplierName,
			unitCostCents: supplierSkus.unitCostCents,
			currency: supplierSkus.currency,
			leadTimeDays: supplierSkus.leadTimeDays,
			createdAt: supplierSkus.createdAt,
		})
		.from(supplierSkus)
		.innerJoin(catalogItems, eq(catalogItems.id, supplierSkus.catalogItemId))
		.where(
			and(
				eq(supplierSkus.workspaceId, workspaceId),
				isNull(supplierSkus.archivedAt),
				supplierId ? eq(supplierSkus.supplierId, supplierId) : undefined,
			),
		)
		.orderBy(asc(catalogItems.name));
}

export async function createSupplierSku(
	workspaceId: string,
	input: SupplierSkuInput,
) {
	// 🔴 Both parents are checked against THIS workspace before writing. The
	// unique index stops duplicates; it does not stop a supplier id borrowed
	// from another tenant, and only this check does.
	const [supplier] = await db
		.select({ id: suppliers.id })
		.from(suppliers)
		.where(
			and(
				eq(suppliers.id, input.supplierId),
				eq(suppliers.workspaceId, workspaceId),
			),
		)
		.limit(1);
	if (!supplier) throw new SupplierError("SUPPLIER_NOT_FOUND");

	const [item] = await db
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.id, input.catalogItemId),
				eq(catalogItems.workspaceId, workspaceId),
			),
		)
		.limit(1);
	if (!item) throw new SupplierError("CATALOG_ITEM_NOT_FOUND");

	/**
	 * 🔑 The workspace's own currency, not a hard-coded one.
	 *
	 * A caller that names a currency is believed — a supplier genuinely may
	 * invoice in another one, and that case is refused later, loudly, rather
	 * than converted. What must never happen is a currency nobody chose.
	 */
	const currency = input.currency ?? (await workspaceCurrency(workspaceId));

	try {
		const [row] = await db
			.insert(supplierSkus)
			.values({ ...input, currency, workspaceId })
			.returning();
		return row;
	} catch (error) {
		// The partial unique index is the authority on duplicates, so a violation
		// is reported as the conflict it is rather than as a server fault.
		if (
			error instanceof Error &&
			/supplier_skus_supplier_item_unique/.test(error.message)
		) {
			throw new SupplierError("SUPPLIER_SKU_EXISTS");
		}
		throw error;
	}
}

export async function updateSupplierSku(
	workspaceId: string,
	id: string,
	patch: z.infer<typeof supplierSkuPatchSchema>,
) {
	const [row] = await db
		.update(supplierSkus)
		.set({ ...patch, updatedAt: new Date() })
		.where(
			and(eq(supplierSkus.id, id), eq(supplierSkus.workspaceId, workspaceId)),
		)
		.returning();
	if (!row) throw new SupplierError("SUPPLIER_SKU_NOT_FOUND");
	return row;
}

export async function deleteSupplierSku(workspaceId: string, id: string) {
	const [row] = await db
		.update(supplierSkus)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(supplierSkus.id, id),
				eq(supplierSkus.workspaceId, workspaceId),
				isNull(supplierSkus.archivedAt),
			),
		)
		.returning();
	if (!row) throw new SupplierError("SUPPLIER_SKU_NOT_FOUND");
	return row;
}
