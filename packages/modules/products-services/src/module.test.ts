import { describe, expect, it } from "vitest";
import {
	CATALOG_ITEM_STATUSES,
	CATALOG_ITEM_TYPES,
	canTransitionCatalogItem,
	catalogItemInputSchema,
	catalogItemPatchSchema,
} from "./item";
import {
	productsServicesModule,
	productsServicesSettingsSchema,
} from "./module";

describe("catalog item contract", () => {
	it("supports broadly useful offering types", () => {
		expect(CATALOG_ITEM_TYPES).toEqual([
			"physical",
			"digital",
			"service",
			"package",
			"rental",
		]);
	});

	it("normalizes a fixed-price physical product", () => {
		expect(
			catalogItemInputSchema.parse({
				name: "  Business Cards  ",
				type: "physical",
				priceCents: 2_500,
				currency: "usd",
			}),
		).toMatchObject({
			name: "Business Cards",
			type: "physical",
			pricingModel: "fixed",
			priceCents: 2_500,
			currency: "USD",
			status: "draft",
		});
	});

	it("supports services priced by hour", () => {
		expect(
			catalogItemInputSchema.parse({
				name: "Consulting",
				type: "service",
				pricingModel: "hourly",
				priceCents: 15_000,
				unitLabel: "hour",
			}),
		).toMatchObject({ pricingModel: "hourly", unitLabel: "hour" });
	});

	it("supports custom-quote work without a fake price", () => {
		expect(
			catalogItemInputSchema.parse({
				name: "Custom Sign Package",
				type: "package",
				pricingModel: "custom_quote",
			}),
		).toMatchObject({ pricingModel: "custom_quote", priceCents: null });
	});

	it("requires a price for fixed, starting-at, and hourly pricing", () => {
		for (const pricingModel of ["fixed", "starting_at", "hourly"] as const) {
			expect(() =>
				catalogItemInputSchema.parse({
					name: "Offering",
					type: "service",
					pricingModel,
				}),
			).toThrow();
		}
	});

	it("rejects a stored price for free or custom-quote offerings", () => {
		for (const pricingModel of ["free", "custom_quote"] as const) {
			expect(() =>
				catalogItemInputSchema.parse({
					name: "Offering",
					type: "service",
					pricingModel,
					priceCents: 100,
				}),
			).toThrow();
		}
	});

	it("stores money as nonnegative integer cents", () => {
		expect(() =>
			catalogItemInputSchema.parse({
				name: "Offering",
				type: "physical",
				priceCents: 10.5,
			}),
		).toThrow();
		expect(() =>
			catalogItemInputSchema.parse({
				name: "Offering",
				type: "physical",
				priceCents: -1,
			}),
		).toThrow();
	});

	it("accepts focused edits but rejects empty patches and direct status changes", () => {
		expect(catalogItemPatchSchema.parse({ name: "  Updated name " })).toEqual({
			name: "Updated name",
		});
		expect(() => catalogItemPatchSchema.parse({})).toThrow();
		expect(() =>
			catalogItemPatchSchema.parse({ status: "archived" }),
		).toThrow();
	});
});

describe("catalog item lifecycle", () => {
	it("supports draft → active → archived", () => {
		expect(canTransitionCatalogItem("draft", "active")).toBe(true);
		expect(canTransitionCatalogItem("active", "archived")).toBe(true);
	});

	it("restores an archived item to draft for review", () => {
		expect(canTransitionCatalogItem("archived", "draft")).toBe(true);
		expect(canTransitionCatalogItem("archived", "active")).toBe(false);
	});

	it("has no self-loops", () => {
		for (const status of CATALOG_ITEM_STATUSES) {
			expect(canTransitionCatalogItem(status, status)).toBe(false);
		}
	});
});

describe("Products & Services module", () => {
	it("has useful workspace defaults", () => {
		expect(productsServicesSettingsSchema.parse({})).toEqual({
			defaultCurrency: "USD",
			productLabelPlural: "Products",
			serviceLabelPlural: "Services",
			showSku: true,
		});
	});

	it("is optional, dependency-free, and unmetered", () => {
		expect(productsServicesModule.id).toBe("products-services");
		expect(productsServicesModule.kind).toBe("shared");
		expect(productsServicesModule.dependsOn).toEqual([]);
		expect(productsServicesModule.meteredAction).toBeNull();
	});
});
