import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	catalogItems,
	catalogItemVariants,
	db,
	eq,
	gt,
	mutationUnitOfWork,
	quickengineWorkspaces,
} from "@quickengine/db";
import { z } from "zod";
import {
	CATALOG_ITEM_STATUSES,
	type CatalogItemStatus,
	canTransitionCatalogItem,
	catalogItemInputSchema,
	catalogItemPatchSchema,
} from "./item";
import {
	canTransitionVariant,
	productVariantInputSchema,
	productVariantPatchSchema,
	type VariantStatus,
	variantCombinationKey,
} from "./variant";

export const catalogListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	// A published/storefront (publishable) read is clamped to active items by the route; an admin
	// read may filter to any status or omit this to see all.
	status: z.enum(CATALOG_ITEM_STATUSES).optional(),
});

export type CatalogMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

const notFound = (resource: string) =>
	new DomainError("NOT_FOUND", `The ${resource} was not found.`);
const skuInUse = () =>
	new DomainError("CONFLICT", "That SKU is already used in this workspace.");

const serializeItem = (row: typeof catalogItems.$inferSelect) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const serializeVariant = (row: typeof catalogItemVariants.$inferSelect) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export type CatalogItemDto = ReturnType<typeof serializeItem>;
export type ProductVariantDto = ReturnType<typeof serializeVariant>;

// Serializing all catalog writes in a workspace behind its row keeps the app-level SKU-uniqueness
// check correct: the UOW advisory lock only guards idempotent retries of one key, not two distinct
// requests racing to claim the same SKU.
async function lockWorkspace(
	transaction: DatabaseTransaction,
	workspaceId: string,
) {
	const [workspace] = await transaction
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1)
		.for("update");
	if (!workspace) throw notFound("workspace");
}

async function assertSkuAvailable(
	transaction: DatabaseTransaction,
	workspaceId: string,
	sku: string,
) {
	const [item] = await transaction
		.select({ id: catalogItems.id })
		.from(catalogItems)
		.where(
			and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.sku, sku)),
		)
		.limit(1);
	if (item) throw skuInUse();
	const [variant] = await transaction
		.select({ id: catalogItemVariants.id })
		.from(catalogItemVariants)
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.sku, sku),
			),
		)
		.limit(1);
	if (variant) throw skuInUse();
}

export async function listCatalogItemsPage(
	workspaceId: string,
	query: { cursor?: string; limit?: number | string; status?: string },
) {
	const page = catalogListQuerySchema.parse(query);
	const where = and(
		eq(catalogItems.workspaceId, workspaceId),
		page.cursor ? gt(catalogItems.id, page.cursor) : undefined,
		page.status ? eq(catalogItems.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(catalogItems)
		.where(where)
		.orderBy(asc(catalogItems.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeItem),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
}

export async function getCatalogItemDto(
	workspaceId: string,
	id: string,
	requiredStatus?: CatalogItemStatus,
) {
	const [row] = await db
		.select()
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				eq(catalogItems.id, id),
				requiredStatus ? eq(catalogItems.status, requiredStatus) : undefined,
			),
		)
		.limit(1);
	return row ? serializeItem(row) : null;
}

export async function listItemVariants(
	workspaceId: string,
	itemId: string,
	requiredStatus?: VariantStatus,
) {
	return (
		await db
			.select()
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, workspaceId),
					eq(catalogItemVariants.catalogItemId, itemId),
					requiredStatus
						? eq(catalogItemVariants.status, requiredStatus)
						: undefined,
				),
			)
			.orderBy(asc(catalogItemVariants.id))
	).map(serializeVariant);
}

export async function getVariantDto(
	workspaceId: string,
	id: string,
	requiredStatus?: VariantStatus,
) {
	const [row] = await db
		.select()
		.from(catalogItemVariants)
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.id, id),
				requiredStatus
					? eq(catalogItemVariants.status, requiredStatus)
					: undefined,
			),
		)
		.limit(1);
	return row ? serializeVariant(row) : null;
}

export function createCatalogItemCommand(
	context: MutationExecutionContext,
	input: unknown,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<CatalogItemDto>> {
	const values = catalogItemInputSchema.parse(input);
	return uow.execute(context, async (transaction) => {
		await lockWorkspace(transaction.db, context.workspaceId);
		if (values.sku)
			await assertSkuAvailable(transaction.db, context.workspaceId, values.sku);
		const [row] = await transaction.db
			.insert(catalogItems)
			.values({ ...values, workspaceId: context.workspaceId })
			.returning();
		await transaction.audit({
			action: "catalog-item.created",
			resourceId: row.id,
			resourceType: "catalog_item",
		});
		await transaction.outbox({
			aggregateId: row.id,
			aggregateType: "catalog_item",
			eventName: "catalog-item.created",
			payload: { catalogItemId: row.id },
			version: 1,
		});
		return { result: serializeItem(row), status: 201 };
	});
}

export function updateCatalogItemCommand(
	context: MutationExecutionContext,
	id: string,
	patch: unknown,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<CatalogItemDto>> {
	const values = catalogItemPatchSchema.parse(patch);
	return uow.execute(context, async (transaction) => {
		await lockWorkspace(transaction.db, context.workspaceId);
		const [current] = await transaction.db
			.select()
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
				),
			)
			.limit(1);
		if (!current) throw notFound("catalog item");
		const merged = catalogItemInputSchema.parse({ ...current, ...values });
		if (merged.sku && merged.sku !== current.sku)
			await assertSkuAvailable(transaction.db, context.workspaceId, merged.sku);
		const [row] = await transaction.db
			.update(catalogItems)
			.set({ ...merged, updatedAt: new Date() })
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
				),
			)
			.returning();
		await transaction.audit({
			action: "catalog-item.updated",
			resourceId: row.id,
			resourceType: "catalog_item",
		});
		await transaction.outbox({
			aggregateId: row.id,
			aggregateType: "catalog_item",
			eventName: "catalog-item.updated",
			payload: { catalogItemId: row.id },
			version: 1,
		});
		return { result: serializeItem(row), status: 200 };
	});
}

export function setCatalogItemStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: CatalogItemStatus,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<CatalogItemDto>> {
	return uow.execute(context, async (transaction) => {
		const [current] = await transaction.db
			.select()
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw notFound("catalog item");
		if (current.status === status)
			throw new DomainError(
				"CONFLICT",
				"The catalog item is already in that status.",
			);
		if (!canTransitionCatalogItem(current.status, status))
			throw new DomainError(
				"CONFLICT",
				`A ${current.status} catalog item cannot move to ${status}.`,
			);
		const [row] = await transaction.db
			.update(catalogItems)
			.set({ status, updatedAt: new Date() })
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
					eq(catalogItems.status, current.status),
				),
			)
			.returning();
		if (!row)
			throw new DomainError(
				"CONFLICT",
				"The catalog item was changed concurrently.",
			);
		if (status === "archived")
			await transaction.db
				.update(catalogItemVariants)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(catalogItemVariants.workspaceId, context.workspaceId),
						eq(catalogItemVariants.catalogItemId, id),
					),
				);
		await transaction.audit({
			action: "catalog-item.status-changed",
			metadata: { status },
			resourceId: row.id,
			resourceType: "catalog_item",
		});
		await transaction.outbox({
			aggregateId: row.id,
			aggregateType: "catalog_item",
			eventName: "catalog-item.status-changed",
			payload: { catalogItemId: row.id, status },
			version: 1,
		});
		return { result: serializeItem(row), status: 200 };
	});
}

export function deleteCatalogItemCommand(
	context: MutationExecutionContext,
	id: string,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow.execute(context, async (transaction) => {
		const [current] = await transaction.db
			.select({ id: catalogItems.id, status: catalogItems.status })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw notFound("catalog item");
		if (current.status !== "archived")
			throw new DomainError(
				"CONFLICT",
				"Archive the catalog item before deleting it.",
			);
		const [row] = await transaction.db
			.delete(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, id),
					eq(catalogItems.status, "archived"),
				),
			)
			.returning({ id: catalogItems.id });
		if (!row)
			throw new DomainError(
				"CONFLICT",
				"The catalog item was changed concurrently.",
			);
		await transaction.audit({
			action: "catalog-item.deleted",
			resourceId: row.id,
			resourceType: "catalog_item",
		});
		await transaction.outbox({
			aggregateId: row.id,
			aggregateType: "catalog_item",
			eventName: "catalog-item.deleted",
			payload: { catalogItemId: row.id },
			version: 1,
		});
		return { result: row, status: 200 };
	});
}

export function createProductVariantCommand(
	context: MutationExecutionContext,
	catalogItemId: string,
	input: unknown,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProductVariantDto>> {
	const values = productVariantInputSchema.parse(input);
	return uow.execute(context, async (transaction) => {
		await lockWorkspace(transaction.db, context.workspaceId);
		const [item] = await transaction.db
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, context.workspaceId),
					eq(catalogItems.id, catalogItemId),
				),
			)
			.limit(1);
		if (!item) throw notFound("catalog item");
		if (values.sku)
			await assertSkuAvailable(transaction.db, context.workspaceId, values.sku);
		const [row] = await transaction.db
			.insert(catalogItemVariants)
			.values({
				...values,
				catalogItemId,
				combinationKey: variantCombinationKey(values.options),
				workspaceId: context.workspaceId,
			})
			.returning();
		await transaction.audit({
			action: "product-variant.created",
			resourceId: row.id,
			resourceType: "product_variant",
		});
		await transaction.outbox({
			aggregateId: catalogItemId,
			aggregateType: "catalog_item",
			eventName: "product-variant.created",
			payload: { catalogItemId, variantId: row.id },
			version: 1,
		});
		return { result: serializeVariant(row), status: 201 };
	});
}

export function updateProductVariantCommand(
	context: MutationExecutionContext,
	id: string,
	patch: unknown,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProductVariantDto>> {
	const values = productVariantPatchSchema.parse(patch);
	return uow.execute(context, async (transaction) => {
		await lockWorkspace(transaction.db, context.workspaceId);
		const [current] = await transaction.db
			.select()
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.limit(1);
		if (!current) throw notFound("variant");
		const merged = productVariantInputSchema.parse({ ...current, ...values });
		if (merged.sku && merged.sku !== current.sku)
			await assertSkuAvailable(transaction.db, context.workspaceId, merged.sku);
		const [row] = await transaction.db
			.update(catalogItemVariants)
			.set({
				...merged,
				combinationKey: variantCombinationKey(merged.options),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.returning();
		await transaction.audit({
			action: "product-variant.updated",
			resourceId: row.id,
			resourceType: "product_variant",
		});
		await transaction.outbox({
			aggregateId: row.catalogItemId,
			aggregateType: "catalog_item",
			eventName: "product-variant.updated",
			payload: { catalogItemId: row.catalogItemId, variantId: row.id },
			version: 1,
		});
		return { result: serializeVariant(row), status: 200 };
	});
}

export function setProductVariantStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: VariantStatus,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ProductVariantDto>> {
	return uow.execute(context, async (transaction) => {
		const [current] = await transaction.db
			.select()
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw notFound("variant");
		if (current.status === status)
			throw new DomainError(
				"CONFLICT",
				"The variant is already in that status.",
			);
		if (!canTransitionVariant(current.status, status))
			throw new DomainError(
				"CONFLICT",
				`A ${current.status} variant cannot move to ${status}.`,
			);
		if (status === "active") {
			const [parent] = await transaction.db
				.select({ status: catalogItems.status })
				.from(catalogItems)
				.where(
					and(
						eq(catalogItems.workspaceId, context.workspaceId),
						eq(catalogItems.id, current.catalogItemId),
					),
				)
				.limit(1);
			if (parent?.status !== "active")
				throw new DomainError(
					"CONFLICT",
					"Activate the catalog item before activating its variant.",
				);
		}
		const [row] = await transaction.db
			.update(catalogItemVariants)
			.set({ status, updatedAt: new Date() })
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
					eq(catalogItemVariants.status, current.status),
				),
			)
			.returning();
		if (!row)
			throw new DomainError(
				"CONFLICT",
				"The variant was changed concurrently.",
			);
		await transaction.audit({
			action: "product-variant.status-changed",
			metadata: { status },
			resourceId: row.id,
			resourceType: "product_variant",
		});
		await transaction.outbox({
			aggregateId: row.catalogItemId,
			aggregateType: "catalog_item",
			eventName: "product-variant.status-changed",
			payload: { catalogItemId: row.catalogItemId, status, variantId: row.id },
			version: 1,
		});
		return { result: serializeVariant(row), status: 200 };
	});
}

export function deleteProductVariantCommand(
	context: MutationExecutionContext,
	id: string,
	uow: CatalogMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow.execute(context, async (transaction) => {
		const [current] = await transaction.db
			.select({
				id: catalogItemVariants.id,
				status: catalogItemVariants.status,
			})
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw notFound("variant");
		if (current.status !== "archived")
			throw new DomainError(
				"CONFLICT",
				"Archive the variant before deleting it.",
			);
		const [row] = await transaction.db
			.delete(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, context.workspaceId),
					eq(catalogItemVariants.id, id),
					eq(catalogItemVariants.status, "archived"),
				),
			)
			.returning({ id: catalogItemVariants.id });
		if (!row)
			throw new DomainError(
				"CONFLICT",
				"The variant was changed concurrently.",
			);
		await transaction.audit({
			action: "product-variant.deleted",
			resourceId: row.id,
			resourceType: "product_variant",
		});
		await transaction.outbox({
			aggregateId: current.id,
			aggregateType: "catalog_item",
			eventName: "product-variant.deleted",
			payload: { variantId: row.id },
			version: 1,
		});
		return { result: row, status: 200 };
	});
}
