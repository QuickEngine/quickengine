import {
	and,
	catalogItems,
	catalogItemVariants,
	db,
	desc,
	eq,
	inArray,
	inventoryAdjustments,
	inventoryItems,
	quickengineWorkspaces,
} from "@quickengine/db";
import {
	type InventoryAdjustmentInput,
	type InventoryItemInput,
	inventoryAdjustmentInputSchema,
	inventoryItemInputSchema,
	nextInventoryBalance,
} from "./inventory";

export type InventoryTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

async function assertTarget(
	executor: Pick<typeof db, "select">,
	workspaceId: string,
	target: { catalogItemId: string; catalogItemVariantId: string | null },
) {
	const [item] = await executor
		.select({ workspaceId: catalogItems.workspaceId })
		.from(catalogItems)
		.where(eq(catalogItems.id, target.catalogItemId))
		.limit(1);
	if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
	if (item.workspaceId !== workspaceId) {
		throw new Error("CATALOG_ITEM_WORKSPACE_MISMATCH");
	}
	if (!target.catalogItemVariantId) return;

	const [variant] = await executor
		.select({
			workspaceId: catalogItemVariants.workspaceId,
			catalogItemId: catalogItemVariants.catalogItemId,
		})
		.from(catalogItemVariants)
		.where(eq(catalogItemVariants.id, target.catalogItemVariantId))
		.limit(1);
	if (!variant) throw new Error("CATALOG_ITEM_VARIANT_NOT_FOUND");
	if (variant.workspaceId !== workspaceId) {
		throw new Error("CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH");
	}
	if (variant.catalogItemId !== target.catalogItemId) {
		throw new Error("CATALOG_ITEM_VARIANT_PARENT_MISMATCH");
	}
}

export async function createInventoryItemInTx(
	tx: InventoryTransaction,
	workspaceId: string,
	input: InventoryItemInput,
) {
	const parsed = inventoryItemInputSchema.parse(input);
	const [workspace] = await tx
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1)
		.for("update");
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	await assertTarget(tx, workspaceId, parsed);
	const [created] = await tx
		.insert(inventoryItems)
		.values({ workspaceId, ...parsed })
		.returning();
	return created;
}

export async function createInventoryItem(
	workspaceId: string,
	input: InventoryItemInput,
) {
	return db.transaction((tx) =>
		createInventoryItemInTx(tx, workspaceId, input),
	);
}

export async function listInventoryItems(workspaceId: string) {
	return db
		.select()
		.from(inventoryItems)
		.where(eq(inventoryItems.workspaceId, workspaceId))
		.orderBy(desc(inventoryItems.createdAt), desc(inventoryItems.id));
}

export type CatalogAvailability = {
	catalogItemId: string;
	catalogItemVariantId: string | null;
	tracked: boolean;
	available: boolean;
	availableQuantity: number | null;
	allowBackorder: boolean;
};

/**
 * Browser-safe stock state for catalog cards and product pages.
 *
 * Untracked items remain purchasable because orders deliberately allow businesses
 * that do not manage stock. Tracked archived items are unavailable, and negative
 * stock only remains purchasable when the workspace explicitly allows backorders.
 */
export async function listCatalogAvailability(
	workspaceId: string,
	catalogItemIds: readonly string[],
	options: { allowNegativeStock?: boolean } = {},
): Promise<CatalogAvailability[]> {
	const uniqueIds = [...new Set(catalogItemIds)];
	if (uniqueIds.length === 0) return [];

	const rows = await db
		.select({
			catalogItemId: inventoryItems.catalogItemId,
			catalogItemVariantId: inventoryItems.catalogItemVariantId,
			status: inventoryItems.status,
			onHand: inventoryItems.onHand,
			reserved: inventoryItems.reserved,
		})
		.from(inventoryItems)
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				inArray(inventoryItems.catalogItemId, uniqueIds),
			),
		);

	const byItem = new Map<string, typeof rows>();
	for (const row of rows) {
		const existing = byItem.get(row.catalogItemId) ?? [];
		existing.push(row);
		byItem.set(row.catalogItemId, existing);
	}

	const availability: CatalogAvailability[] = [];
	for (const catalogItemId of uniqueIds) {
		const tracked = byItem.get(catalogItemId);
		if (!tracked?.length) {
			availability.push({
				catalogItemId,
				catalogItemVariantId: null,
				tracked: false,
				available: true,
				availableQuantity: null,
				allowBackorder: false,
			});
			continue;
		}
		for (const row of tracked) {
			const availableQuantity = row.onHand - row.reserved;
			const allowBackorder = options.allowNegativeStock ?? false;
			availability.push({
				catalogItemId: row.catalogItemId,
				catalogItemVariantId: row.catalogItemVariantId,
				tracked: true,
				available:
					row.status === "active" && (allowBackorder || availableQuantity > 0),
				availableQuantity,
				allowBackorder,
			});
		}
	}
	return availability;
}

export async function getInventoryItem(workspaceId: string, id: string) {
	const [item] = await db
		.select()
		.from(inventoryItems)
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				eq(inventoryItems.id, id),
			),
		)
		.limit(1);
	return item;
}

export async function updateInventoryItemInTx(
	tx: InventoryTransaction,
	workspaceId: string,
	id: string,
	input: { lowStockThreshold?: number; metadata?: Record<string, unknown> },
) {
	if (input.lowStockThreshold !== undefined) {
		inventoryItemInputSchema.shape.lowStockThreshold.parse(
			input.lowStockThreshold,
		);
	}
	if (input.metadata !== undefined) {
		inventoryItemInputSchema.shape.metadata.parse(input.metadata);
	}
	if (Object.keys(input).length === 0) {
		throw new Error("INVENTORY_UPDATE_EMPTY");
	}
	const [updated] = await tx
		.update(inventoryItems)
		.set({ ...input, updatedAt: new Date() })
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				eq(inventoryItems.id, id),
			),
		)
		.returning();
	if (!updated) throw new Error("INVENTORY_ITEM_NOT_FOUND");
	return updated;
}

export async function updateInventoryItem(
	workspaceId: string,
	id: string,
	input: { lowStockThreshold?: number; metadata?: Record<string, unknown> },
) {
	return db.transaction((tx) =>
		updateInventoryItemInTx(tx, workspaceId, id, input),
	);
}

export async function setInventoryItemStatusInTx(
	tx: InventoryTransaction,
	workspaceId: string,
	id: string,
	status: "active" | "archived",
) {
	const [current] = await tx
		.select()
		.from(inventoryItems)
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				eq(inventoryItems.id, id),
			),
		)
		.limit(1)
		.for("update");
	if (!current) throw new Error("INVENTORY_ITEM_NOT_FOUND");
	if (current.status === status) throw new Error("INVENTORY_STATUS_UNCHANGED");
	if (status === "archived" && current.reserved > 0)
		throw new Error("INVENTORY_HAS_RESERVATIONS");
	const [updated] = await tx
		.update(inventoryItems)
		.set({ status, updatedAt: new Date() })
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				eq(inventoryItems.id, id),
				eq(inventoryItems.status, current.status),
			),
		)
		.returning();
	if (!updated) throw new Error("INVENTORY_CONCURRENT_UPDATE");
	return updated;
}

export async function setInventoryItemStatus(
	workspaceId: string,
	id: string,
	status: "active" | "archived",
) {
	return db.transaction((tx) =>
		setInventoryItemStatusInTx(tx, workspaceId, id, status),
	);
}

export async function applyInventoryAdjustmentInTx(
	tx: InventoryTransaction,
	workspaceId: string,
	id: string,
	input: InventoryAdjustmentInput,
	options: { allowNegativeStock?: boolean } = {},
) {
	const parsed = inventoryAdjustmentInputSchema.parse(input);
	{
		const [current] = await tx
			.select()
			.from(inventoryItems)
			.where(
				and(
					eq(inventoryItems.workspaceId, workspaceId),
					eq(inventoryItems.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("INVENTORY_ITEM_NOT_FOUND");
		if (current.status !== "active") {
			throw new Error("INVENTORY_ITEM_ARCHIVED");
		}
		// Check after locking the balance row: simultaneous deliveries carrying the
		// same key serialize here, so the second sees and returns the first movement.
		if (parsed.idempotencyKey) {
			const [existing] = await tx
				.select()
				.from(inventoryAdjustments)
				.where(
					and(
						eq(inventoryAdjustments.workspaceId, workspaceId),
						eq(inventoryAdjustments.idempotencyKey, parsed.idempotencyKey),
					),
				)
				.limit(1);
			if (existing) return existing;
		}

		const next = nextInventoryBalance(
			{ onHand: current.onHand, reserved: current.reserved },
			parsed.kind,
			parsed.quantity,
			options.allowNegativeStock ?? false,
		);
		const [adjustment] = await tx
			.insert(inventoryAdjustments)
			.values({
				workspaceId,
				inventoryItemId: id,
				...parsed,
				onHandDelta: next.onHand - current.onHand,
				reservedDelta: next.reserved - current.reserved,
				resultingOnHand: next.onHand,
				resultingReserved: next.reserved,
			})
			.returning();
		await tx
			.update(inventoryItems)
			.set({
				onHand: next.onHand,
				reserved: next.reserved,
				updatedAt: new Date(),
			})
			.where(eq(inventoryItems.id, id));
		return adjustment;
	}
}

export async function applyInventoryAdjustment(
	workspaceId: string,
	id: string,
	input: InventoryAdjustmentInput,
	options: { allowNegativeStock?: boolean } = {},
) {
	return db.transaction((tx) =>
		applyInventoryAdjustmentInTx(tx, workspaceId, id, input, options),
	);
}

export async function listInventoryAdjustments(
	workspaceId: string,
	inventoryItemId: string,
) {
	return db
		.select()
		.from(inventoryAdjustments)
		.where(
			and(
				eq(inventoryAdjustments.workspaceId, workspaceId),
				eq(inventoryAdjustments.inventoryItemId, inventoryItemId),
			),
		)
		.orderBy(
			desc(inventoryAdjustments.createdAt),
			desc(inventoryAdjustments.id),
		);
}

export async function hasInventoryAdjustments(workspaceId: string) {
	const [adjustment] = await db
		.select({ id: inventoryAdjustments.id })
		.from(inventoryAdjustments)
		.where(eq(inventoryAdjustments.workspaceId, workspaceId))
		.limit(1);
	return adjustment !== undefined;
}

export async function deleteInventoryItemInTx(
	tx: InventoryTransaction,
	workspaceId: string,
	id: string,
) {
	{
		const [current] = await tx
			.select()
			.from(inventoryItems)
			.where(
				and(
					eq(inventoryItems.workspaceId, workspaceId),
					eq(inventoryItems.id, id),
				),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("INVENTORY_ITEM_NOT_FOUND");
		if (current.status !== "archived")
			throw new Error("INVENTORY_ITEM_MUST_BE_ARCHIVED");
		if (current.onHand !== 0 || current.reserved !== 0)
			throw new Error("INVENTORY_BALANCE_NOT_ZERO");
		const [history] = await tx
			.select({ id: inventoryAdjustments.id })
			.from(inventoryAdjustments)
			.where(
				and(
					eq(inventoryAdjustments.workspaceId, workspaceId),
					eq(inventoryAdjustments.inventoryItemId, id),
				),
			)
			.limit(1);
		if (history) throw new Error("INVENTORY_HISTORY_EXISTS");
		const [deleted] = await tx
			.delete(inventoryItems)
			.where(
				and(
					eq(inventoryItems.workspaceId, workspaceId),
					eq(inventoryItems.id, id),
					eq(inventoryItems.status, "archived"),
				),
			)
			.returning();
		return deleted;
	}
}

export async function deleteInventoryItem(workspaceId: string, id: string) {
	return db.transaction((tx) => deleteInventoryItemInTx(tx, workspaceId, id));
}
