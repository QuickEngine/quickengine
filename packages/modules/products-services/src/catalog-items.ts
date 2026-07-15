import {
	and,
	catalogItems,
	catalogItemVariants,
	db,
	desc,
	eq,
	quickengineWorkspaces,
} from "@quickengine/db";
import {
	type CatalogItemInput,
	type CatalogItemPatch,
	type CatalogItemStatus,
	canTransitionCatalogItem,
	catalogItemInputSchema,
	catalogItemPatchSchema,
} from "./item";

export async function createCatalogItem(
	workspaceId: string,
	input: CatalogItemInput,
) {
	const item = catalogItemInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}
		if (item.sku) {
			const [variant] = await tx
				.select({ id: catalogItemVariants.id })
				.from(catalogItemVariants)
				.where(
					and(
						eq(catalogItemVariants.workspaceId, workspaceId),
						eq(catalogItemVariants.sku, item.sku),
					),
				)
				.limit(1);
			if (variant) {
				throw new Error("CATALOG_SKU_IN_USE");
			}
		}
		const [created] = await tx
			.insert(catalogItems)
			.values({ workspaceId, ...item })
			.returning();
		return created;
	});
}

export async function listCatalogItems(
	workspaceId: string,
	status?: CatalogItemStatus,
) {
	return db
		.select()
		.from(catalogItems)
		.where(
			status
				? and(
						eq(catalogItems.workspaceId, workspaceId),
						eq(catalogItems.status, status),
					)
				: eq(catalogItems.workspaceId, workspaceId),
		)
		.orderBy(desc(catalogItems.createdAt));
}

export async function getCatalogItem(workspaceId: string, id: string) {
	const [item] = await db
		.select()
		.from(catalogItems)
		.where(
			and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, id)),
		)
		.limit(1);
	return item;
}

export async function updateCatalogItem(
	workspaceId: string,
	id: string,
	input: CatalogItemPatch,
) {
	const patch = catalogItemPatchSchema.parse(input);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}
		const [current] = await tx
			.select()
			.from(catalogItems)
			.where(
				and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, id)),
			)
			.limit(1);
		if (!current) {
			throw new Error("CATALOG_ITEM_NOT_FOUND");
		}
		const updatedValues = catalogItemInputSchema.parse({
			...current,
			...patch,
		});
		if (updatedValues.sku) {
			const [variant] = await tx
				.select({ id: catalogItemVariants.id })
				.from(catalogItemVariants)
				.where(
					and(
						eq(catalogItemVariants.workspaceId, workspaceId),
						eq(catalogItemVariants.sku, updatedValues.sku),
					),
				)
				.limit(1);
			if (variant) {
				throw new Error("CATALOG_SKU_IN_USE");
			}
		}
		const [updated] = await tx
			.update(catalogItems)
			.set({ ...updatedValues, updatedAt: new Date() })
			.where(
				and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, id)),
			)
			.returning();
		return updated;
	});
}

export async function setCatalogItemStatus(
	workspaceId: string,
	id: string,
	status: CatalogItemStatus,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(catalogItems)
			.where(
				and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("CATALOG_ITEM_NOT_FOUND");
		if (current.status === status)
			throw new Error("CATALOG_ITEM_STATUS_UNCHANGED");
		if (!canTransitionCatalogItem(current.status, status))
			throw new Error("CATALOG_ITEM_ILLEGAL_TRANSITION");
		const [updated] = await tx
			.update(catalogItems)
			.set({ status, updatedAt: new Date() })
			.where(
				and(
					eq(catalogItems.workspaceId, workspaceId),
					eq(catalogItems.id, id),
					eq(catalogItems.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("CATALOG_ITEM_CONCURRENT_UPDATE");
		if (status === "archived") {
			await tx
				.update(catalogItemVariants)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(catalogItemVariants.workspaceId, workspaceId),
						eq(catalogItemVariants.catalogItemId, id),
					),
				);
		}
		return updated;
	});
}

export async function deleteCatalogItem(workspaceId: string, id: string) {
	const current = await getCatalogItem(workspaceId, id);
	if (!current) {
		throw new Error("CATALOG_ITEM_NOT_FOUND");
	}
	if (current.status !== "archived") {
		throw new Error("CATALOG_ITEM_MUST_BE_ARCHIVED");
	}

	const [deleted] = await db
		.delete(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				eq(catalogItems.id, id),
				eq(catalogItems.status, "archived"),
			),
		)
		.returning();
	return deleted;
}
