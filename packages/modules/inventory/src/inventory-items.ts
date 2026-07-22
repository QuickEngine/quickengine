import {
	and,
	catalogItems,
	catalogItemVariants,
	db,
	desc,
	eq,
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

export async function createInventoryItem(
	workspaceId: string,
	input: InventoryItemInput,
) {
	const parsed = inventoryItemInputSchema.parse(input);
	return db.transaction(async (tx) => {
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
	});
}

export async function listInventoryItems(workspaceId: string) {
	return db
		.select()
		.from(inventoryItems)
		.where(eq(inventoryItems.workspaceId, workspaceId))
		.orderBy(desc(inventoryItems.createdAt), desc(inventoryItems.id));
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

export async function updateInventoryItem(
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
	const [updated] = await db
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

export async function setInventoryItemStatus(
	workspaceId: string,
	id: string,
	status: "active" | "archived",
) {
	return db.transaction(async (tx) => {
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
		if (current.status === status)
			throw new Error("INVENTORY_STATUS_UNCHANGED");
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
	});
}

export async function applyInventoryAdjustment(
	workspaceId: string,
	id: string,
	input: InventoryAdjustmentInput,
	options: { allowNegativeStock?: boolean } = {},
) {
	const parsed = inventoryAdjustmentInputSchema.parse(input);
	return db.transaction(async (tx) => {
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
	});
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

export async function deleteInventoryItem(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
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
	});
}
