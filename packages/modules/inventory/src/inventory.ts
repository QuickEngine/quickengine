import { z } from "zod";

export const INVENTORY_ITEM_STATUSES = ["active", "archived"] as const;

export const inventoryTargetSchema = z
	.object({
		catalogItemId: z.uuid(),
		catalogItemVariantId: z.uuid().nullable().default(null),
	})
	.strict();

export type InventoryTarget = z.output<typeof inventoryTargetSchema>;

export const inventoryItemInputSchema = inventoryTargetSchema.extend({
	status: z.enum(INVENTORY_ITEM_STATUSES).default("active"),
	lowStockThreshold: z.number().int().nonnegative().default(0),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export type InventoryItemInput = z.input<typeof inventoryItemInputSchema>;
export type InventoryItem = z.output<typeof inventoryItemInputSchema>;

export const INVENTORY_ADJUSTMENT_KINDS = [
	"receive",
	"sale",
	"customer_return",
	"damage",
	"correction_in",
	"correction_out",
	"reserve",
	"release",
	"fulfill_reserved",
] as const;

export type InventoryAdjustmentKind =
	(typeof INVENTORY_ADJUSTMENT_KINDS)[number];

export const inventoryAdjustmentInputSchema = z.object({
	kind: z.enum(INVENTORY_ADJUSTMENT_KINDS),
	quantity: z.number().int().positive().max(1_000_000_000),
	note: z.string().trim().max(1_000).nullable().default(null),
	// Lets Orders or a future Purchasing module link a movement without Inventory
	// owning those domain records.
	referenceId: z.uuid().nullable().default(null),
	// Provider/event handlers can use this later to make repeated delivery harmless.
	idempotencyKey: z.string().trim().min(1).max(200).nullable().default(null),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export type InventoryAdjustmentInput = z.input<
	typeof inventoryAdjustmentInputSchema
>;
export type InventoryAdjustment = z.output<
	typeof inventoryAdjustmentInputSchema
>;

export type InventoryBalanceDelta = {
	onHand: number;
	reserved: number;
};

/** Convert a named business movement into its two auditable balance effects. */
export function inventoryBalanceDelta(
	kind: InventoryAdjustmentKind,
	quantity: number,
): InventoryBalanceDelta {
	const positive = Math.abs(quantity);
	switch (kind) {
		case "receive":
		case "customer_return":
		case "correction_in":
			return { onHand: positive, reserved: 0 };
		case "sale":
		case "damage":
		case "correction_out":
			return { onHand: -positive, reserved: 0 };
		case "reserve":
			return { onHand: 0, reserved: positive };
		case "release":
			return { onHand: 0, reserved: -positive };
		case "fulfill_reserved":
			return { onHand: -positive, reserved: -positive };
	}
}

export function availableQuantity(balance: InventoryBalanceDelta): number {
	return balance.onHand - balance.reserved;
}

export function isLowStock(
	balance: InventoryBalanceDelta,
	threshold: number,
): boolean {
	return availableQuantity(balance) <= threshold;
}

export function nextInventoryBalance(
	balance: InventoryBalanceDelta,
	kind: InventoryAdjustmentKind,
	quantity: number,
	allowNegativeStock = false,
): InventoryBalanceDelta {
	const delta = inventoryBalanceDelta(kind, quantity);
	const next = {
		onHand: balance.onHand + delta.onHand,
		reserved: balance.reserved + delta.reserved,
	};
	if (next.reserved < 0) {
		throw new Error("INVENTORY_RESERVED_BELOW_ZERO");
	}
	if (!allowNegativeStock && availableQuantity(next) < 0) {
		throw new Error("INVENTORY_INSUFFICIENT_AVAILABLE");
	}
	return next;
}
