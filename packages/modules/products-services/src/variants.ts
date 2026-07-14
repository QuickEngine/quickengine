import {
	and,
	catalogItems,
	catalogItemVariants,
	db,
	eq,
	quickengineWorkspaces,
} from "@quickengine/db";
import {
	canTransitionVariant,
	type ProductVariantInput,
	type ProductVariantPatch,
	productVariantInputSchema,
	productVariantPatchSchema,
	type VariantStatus,
	variantCombinationKey,
} from "./variant";

async function findVariant(workspaceId: string, id: string) {
	const [variant] = await db
		.select()
		.from(catalogItemVariants)
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.id, id),
			),
		)
		.limit(1);
	return variant;
}

export async function createProductVariant(
	workspaceId: string,
	catalogItemId: string,
	input: ProductVariantInput,
) {
	const parsed = productVariantInputSchema.parse(input);
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
			throw new Error("CATALOG_ITEM_NOT_FOUND");
		}
		if (parsed.sku) {
			const [baseItem] = await tx
				.select({ id: catalogItems.id })
				.from(catalogItems)
				.where(
					and(
						eq(catalogItems.workspaceId, workspaceId),
						eq(catalogItems.sku, parsed.sku),
					),
				)
				.limit(1);
			if (baseItem) {
				throw new Error("CATALOG_SKU_IN_USE");
			}
		}
		const [created] = await tx
			.insert(catalogItemVariants)
			.values({
				workspaceId,
				catalogItemId,
				combinationKey: variantCombinationKey(parsed.options),
				...parsed,
			})
			.returning();
		return created;
	});
}

export async function listProductVariants(
	workspaceId: string,
	catalogItemId: string,
) {
	return db
		.select()
		.from(catalogItemVariants)
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.catalogItemId, catalogItemId),
			),
		);
}

export async function getProductVariant(workspaceId: string, id: string) {
	return findVariant(workspaceId, id);
}

export async function updateProductVariant(
	workspaceId: string,
	id: string,
	input: ProductVariantPatch,
) {
	const patch = productVariantPatchSchema.parse(input);
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
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.limit(1);
		if (!current) {
			throw new Error("VARIANT_NOT_FOUND");
		}
		const parsed = productVariantInputSchema.parse({ ...current, ...patch });
		if (parsed.sku) {
			const [baseItem] = await tx
				.select({ id: catalogItems.id })
				.from(catalogItems)
				.where(
					and(
						eq(catalogItems.workspaceId, workspaceId),
						eq(catalogItems.sku, parsed.sku),
					),
				)
				.limit(1);
			if (baseItem) {
				throw new Error("CATALOG_SKU_IN_USE");
			}
		}
		const [updated] = await tx
			.update(catalogItemVariants)
			.set({
				...parsed,
				combinationKey: variantCombinationKey(parsed.options),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(catalogItemVariants.workspaceId, workspaceId),
					eq(catalogItemVariants.id, id),
				),
			)
			.returning();
		return updated;
	});
}

export async function setProductVariantStatus(
	workspaceId: string,
	id: string,
	status: VariantStatus,
) {
	const current = await findVariant(workspaceId, id);
	if (!current) {
		throw new Error("VARIANT_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("VARIANT_STATUS_UNCHANGED");
	}
	if (!canTransitionVariant(current.status, status)) {
		throw new Error("VARIANT_ILLEGAL_TRANSITION");
	}
	if (status === "active") {
		const [parent] = await db
			.select({ status: catalogItems.status })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.workspaceId, workspaceId),
					eq(catalogItems.id, current.catalogItemId),
				),
			)
			.limit(1);
		if (parent?.status !== "active") {
			throw new Error("VARIANT_PARENT_NOT_ACTIVE");
		}
	}
	const [updated] = await db
		.update(catalogItemVariants)
		.set({ status, updatedAt: new Date() })
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.id, id),
				eq(catalogItemVariants.status, current.status),
			),
		)
		.returning();
	if (!updated) {
		throw new Error("VARIANT_CONCURRENT_UPDATE");
	}
	return updated;
}

export async function deleteProductVariant(workspaceId: string, id: string) {
	const current = await findVariant(workspaceId, id);
	if (!current) {
		throw new Error("VARIANT_NOT_FOUND");
	}
	if (current.status !== "archived") {
		throw new Error("VARIANT_MUST_BE_ARCHIVED");
	}
	const [deleted] = await db
		.delete(catalogItemVariants)
		.where(
			and(
				eq(catalogItemVariants.workspaceId, workspaceId),
				eq(catalogItemVariants.id, id),
				eq(catalogItemVariants.status, "archived"),
			),
		)
		.returning();
	return deleted;
}
