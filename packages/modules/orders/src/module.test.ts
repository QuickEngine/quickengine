import { describe, expect, it } from "vitest";
import { ordersModule, ordersSettingsSchema } from "./module";
import { orderInputSchema, orderLineInputSchema } from "./order";
import { canTransitionOrder, ORDER_STATUSES } from "./status";
import {
	computeOrderTotals,
	formatOrderNumber,
	orderLineTotalCents,
} from "./totals";

const clientId = "00000000-0000-4000-8000-000000000001";
const catalogItemId = "00000000-0000-4000-8000-000000000002";
const catalogItemVariantId = "00000000-0000-4000-8000-000000000003";

describe("order line snapshots", () => {
	it("keeps the purchased name, type, SKU, quantity, and price", () => {
		expect(
			orderLineInputSchema.parse({
				catalogItemId,
				name: "  Business Cards ",
				type: "physical",
				sku: " CARDS-100 ",
				quantity: 3,
				unitPriceCents: 2_500,
			}),
		).toMatchObject({
			catalogItemId,
			name: "Business Cards",
			type: "physical",
			sku: "CARDS-100",
			quantity: 3,
			unitPriceCents: 2_500,
		});
	});

	it("allows a deleted catalog reference while preserving the snapshot", () => {
		expect(
			orderLineInputSchema.parse({
				name: "Retired Service",
				type: "service",
				quantity: 1,
				unitPriceCents: 10_000,
			}),
		).toMatchObject({ catalogItemId: null, name: "Retired Service" });
	});

	it("links a concrete variant through its parent catalog item", () => {
		expect(
			orderLineInputSchema.parse({
				catalogItemId,
				catalogItemVariantId,
				name: "Business Cards — Matte / 500",
				type: "physical",
				quantity: 1,
				unitPriceCents: 5_000,
			}),
		).toMatchObject({ catalogItemId, catalogItemVariantId });
	});

	it("rejects a variant without its parent catalog item", () => {
		expect(() =>
			orderLineInputSchema.parse({
				catalogItemVariantId,
				name: "Orphaned variant",
				type: "physical",
				quantity: 1,
				unitPriceCents: 5_000,
			}),
		).toThrow();
	});

	it("requires a positive whole-unit quantity and integer-cent price", () => {
		for (const quantity of [0, -1, 1.5]) {
			expect(() =>
				orderLineInputSchema.parse({
					name: "Item",
					type: "physical",
					quantity,
					unitPriceCents: 100,
				}),
			).toThrow();
		}
		expect(() =>
			orderLineInputSchema.parse({
				name: "Impossible total",
				type: "physical",
				quantity: 1_000_000,
				unitPriceCents: 1_000_000,
			}),
		).toThrow();
	});

	it("requires an order to have a client and at least one line", () => {
		expect(() => orderInputSchema.parse({ clientId, lines: [] })).toThrow();
		expect(() =>
			orderInputSchema.parse({
				lines: [
					{
						name: "Item",
						type: "physical",
						quantity: 1,
						unitPriceCents: 100,
					},
				],
			}),
		).toThrow();
	});
});

describe("order totals", () => {
	it("uses immutable integer-cent snapshots", () => {
		expect(orderLineTotalCents({ quantity: 3, unitPriceCents: 2_500 })).toBe(
			7_500,
		);
		expect(
			computeOrderTotals([
				{ quantity: 3, unitPriceCents: 2_500 },
				{ quantity: 2, unitPriceCents: 125 },
			]),
		).toEqual({ subtotalCents: 7_750, totalCents: 7_750 });
	});

	it("formats stable human order numbers", () => {
		expect(formatOrderNumber("ORD", 7)).toBe("ORD-0007");
		expect(formatOrderNumber("WEB", 12_345)).toBe("WEB-12345");
	});
});

describe("order lifecycle", () => {
	it("supports placed → confirmed → processing → fulfilled", () => {
		expect(canTransitionOrder("placed", "confirmed")).toBe(true);
		expect(canTransitionOrder("confirmed", "processing")).toBe(true);
		expect(canTransitionOrder("processing", "fulfilled")).toBe(true);
	});

	it("allows cancellation before fulfillment", () => {
		for (const status of [
			"draft",
			"placed",
			"confirmed",
			"processing",
		] as const) {
			expect(canTransitionOrder(status, "cancelled")).toBe(true);
		}
	});

	it("makes fulfilled and cancelled terminal with no self-loops", () => {
		expect(canTransitionOrder("fulfilled", "cancelled")).toBe(false);
		expect(canTransitionOrder("cancelled", "placed")).toBe(false);
		for (const status of ORDER_STATUSES) {
			expect(canTransitionOrder(status, status)).toBe(false);
		}
	});
});

describe("Orders module", () => {
	it("declares the records it composes with", () => {
		expect(ordersModule.dependsOn).toEqual([
			"client-records",
			"products-services",
			"fulfillment",
		]);
	});

	it("is domain-specific and unmetered", () => {
		expect(ordersModule.kind).toBe("domain");
		expect(ordersModule.meteredAction).toBeNull();
	});

	it("uses conservative workspace defaults", () => {
		expect(ordersSettingsSchema.parse({})).toEqual({
			numberPrefix: "ORD",
			defaultCurrency: "USD",
			autoConfirm: false,
		});
	});
});
