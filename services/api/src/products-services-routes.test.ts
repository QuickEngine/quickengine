import { describe, expect, it } from "vitest";
import { browserCatalogStatus } from "./products-services-routes";

describe("browser catalog visibility", () => {
	it("clamps both public browser key types to active products", () => {
		expect(browserCatalogStatus("publishable")).toBe("active");
		expect(browserCatalogStatus("storefront")).toBe("active");
	});

	it("leaves trusted operator credentials able to read every status", () => {
		expect(browserCatalogStatus("secret")).toBeUndefined();
		expect(browserCatalogStatus("scoped")).toBeUndefined();
		expect(browserCatalogStatus(undefined)).toBeUndefined();
	});
});
