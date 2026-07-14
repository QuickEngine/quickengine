import { describe, expect, it } from "vitest";
import {
	canTransitionVariant,
	formatVariantLabel,
	productVariantInputSchema,
	productVariantPatchSchema,
	VARIANT_STATUSES,
	variantCombinationKey,
} from "./variant";

describe("product variant contract", () => {
	it("represents one concrete combination of option values", () => {
		expect(
			productVariantInputSchema.parse({
				options: [
					{ name: " Size ", value: " Large " },
					{ name: "Color", value: "Black" },
				],
				sku: " shirt-l-blk ",
				priceCentsOverride: 3_500,
			}),
		).toMatchObject({
			options: [
				{ name: "Size", value: "Large" },
				{ name: "Color", value: "Black" },
			],
			sku: "SHIRT-L-BLK",
			priceCentsOverride: 3_500,
			status: "draft",
		});
	});

	it("inherits the parent price when no override is stored", () => {
		expect(
			productVariantInputSchema.parse({
				options: [{ name: "Format", value: "PDF" }],
			}),
		).toMatchObject({ sku: null, priceCentsOverride: null });
	});

	it("rejects duplicate option dimensions regardless of case", () => {
		expect(() =>
			productVariantInputSchema.parse({
				options: [
					{ name: "Size", value: "Large" },
					{ name: "size", value: "Small" },
				],
			}),
		).toThrow();
	});

	it("rejects empty combinations and fractional or negative cents", () => {
		expect(() => productVariantInputSchema.parse({ options: [] })).toThrow();
		for (const priceCentsOverride of [-1, 10.5]) {
			expect(() =>
				productVariantInputSchema.parse({
					options: [{ name: "Size", value: "Large" }],
					priceCentsOverride,
				}),
			).toThrow();
		}
	});

	it("accepts focused patches but keeps status on the lifecycle path", () => {
		expect(productVariantPatchSchema.parse({ sku: " blue-l " })).toEqual({
			sku: "BLUE-L",
		});
		expect(() => productVariantPatchSchema.parse({})).toThrow();
		expect(() =>
			productVariantPatchSchema.parse({ status: "archived" }),
		).toThrow();
	});

	it("builds the same combination identity regardless of option order/case", () => {
		const first = variantCombinationKey([
			{ name: "Size", value: "Large" },
			{ name: "Color", value: "Black" },
		]);
		const second = variantCombinationKey([
			{ name: "color", value: "black" },
			{ name: "SIZE", value: "LARGE" },
		]);
		expect(first).toBe("color=black|size=large");
		expect(second).toBe(first);
	});

	it("formats a readable option label", () => {
		expect(
			formatVariantLabel([
				{ name: "Size", value: "Large" },
				{ name: "Color", value: "Black" },
			]),
		).toBe("Size: Large / Color: Black");
	});
});

describe("product variant lifecycle", () => {
	it("supports draft → active → archived and restores through draft", () => {
		expect(canTransitionVariant("draft", "active")).toBe(true);
		expect(canTransitionVariant("active", "archived")).toBe(true);
		expect(canTransitionVariant("archived", "draft")).toBe(true);
		expect(canTransitionVariant("archived", "active")).toBe(false);
	});

	it("has no self-loops", () => {
		for (const status of VARIANT_STATUSES) {
			expect(canTransitionVariant(status, status)).toBe(false);
		}
	});
});
