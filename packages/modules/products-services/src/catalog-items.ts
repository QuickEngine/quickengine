import {
	and,
	catalogItems,
	db,
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

async function requireWorkspace(workspaceId: string) {
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}
}

export async function createCatalogItem(
	workspaceId: string,
	input: CatalogItemInput,
) {
	const item = catalogItemInputSchema.parse(input);
	await requireWorkspace(workspaceId);

	const [created] = await db
		.insert(catalogItems)
		.values({ workspaceId, ...item })
		.returning();
	return created;
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
		);
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
	const current = await getCatalogItem(workspaceId, id);
	if (!current) {
		throw new Error("CATALOG_ITEM_NOT_FOUND");
	}

	const updatedValues = catalogItemInputSchema.parse({ ...current, ...patch });
	const [updated] = await db
		.update(catalogItems)
		.set({ ...updatedValues, updatedAt: new Date() })
		.where(
			and(eq(catalogItems.workspaceId, workspaceId), eq(catalogItems.id, id)),
		)
		.returning();
	return updated;
}

export async function setCatalogItemStatus(
	workspaceId: string,
	id: string,
	status: CatalogItemStatus,
) {
	const current = await getCatalogItem(workspaceId, id);
	if (!current) {
		throw new Error("CATALOG_ITEM_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("CATALOG_ITEM_STATUS_UNCHANGED");
	}
	if (!canTransitionCatalogItem(current.status, status)) {
		throw new Error("CATALOG_ITEM_ILLEGAL_TRANSITION");
	}

	const [updated] = await db
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
	if (!updated) {
		throw new Error("CATALOG_ITEM_CONCURRENT_UPDATE");
	}
	return updated;
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
