import { describe, expect, it } from "vitest";
import {
	availableQuantity,
	inventoryAdjustmentInputSchema,
	inventoryBalanceDelta,
	inventoryItemInputSchema,
	isLowStock,
	nextInventoryBalance,
} from "./inventory";
import { inventoryModule, inventorySettingsSchema } from "./module";

const catalogItemId = "00000000-0000-4000-8000-000000000001";
const catalogItemVariantId = "00000000-0000-4000-8000-000000000002";

describe("inventory module", () => {
	it("depends only on the catalog and is not usage-metered", () => {
		expect(inventoryModule).toMatchObject({
			id: "inventory",
			dependsOn: ["products-services"],
			meteredAction: null,
		});
	});

	it("defaults to safe stock behavior", () => {
		expect(inventorySettingsSchema.parse({})).toEqual({
			defaultLowStockThreshold: 5,
			allowNegativeStock: false,
		});
	});

	it("tracks a base catalog item or one concrete variant", () => {
		expect(inventoryItemInputSchema.parse({ catalogItemId })).toMatchObject({
			catalogItemId,
			catalogItemVariantId: null,
			status: "active",
		});
		expect(
			inventoryItemInputSchema.parse({ catalogItemId, catalogItemVariantId }),
		).toMatchObject({ catalogItemId, catalogItemVariantId });
	});

	it("rejects invalid thresholds", () => {
		expect(() =>
			inventoryItemInputSchema.parse({
				catalogItemId,
				lowStockThreshold: -1,
			}),
		).toThrow();
	});
});

describe("inventory movements", () => {
	it("requires a named movement and a positive whole-unit quantity", () => {
		expect(
			inventoryAdjustmentInputSchema.parse({ kind: "receive", quantity: 10 }),
		).toMatchObject({ kind: "receive", quantity: 10 });
		for (const quantity of [0, -1, 1.5]) {
			expect(() =>
				inventoryAdjustmentInputSchema.parse({ kind: "sale", quantity }),
			).toThrow();
		}
	});

	it("separates physical stock from reservations", () => {
		expect(inventoryBalanceDelta("receive", 10)).toEqual({
			onHand: 10,
			reserved: 0,
		});
		expect(inventoryBalanceDelta("reserve", 3)).toEqual({
			onHand: 0,
			reserved: 3,
		});
		expect(inventoryBalanceDelta("fulfill_reserved", 3)).toEqual({
			onHand: -3,
			reserved: -3,
		});
	});

	it("computes available and low stock from on-hand minus reserved", () => {
		const balance = { onHand: 8, reserved: 3 };
		expect(availableQuantity(balance)).toBe(5);
		expect(isLowStock(balance, 5)).toBe(true);
		expect(isLowStock(balance, 4)).toBe(false);
	});

	it("prevents overselling and over-releasing by default", () => {
		expect(() =>
			nextInventoryBalance({ onHand: 2, reserved: 0 }, "sale", 3),
		).toThrow("INVENTORY_INSUFFICIENT_AVAILABLE");
		expect(() =>
			nextInventoryBalance({ onHand: 5, reserved: 1 }, "release", 2),
		).toThrow("INVENTORY_RESERVED_BELOW_ZERO");
	});

	it("allows an explicit negative-stock policy without negative reservations", () => {
		expect(
			nextInventoryBalance({ onHand: 2, reserved: 0 }, "sale", 3, true),
		).toEqual({ onHand: -1, reserved: 0 });
	});
});
