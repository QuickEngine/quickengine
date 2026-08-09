import { describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("../lib/api", () => ({
	workspaceApi: () => ({ catalog: { create } }),
}));

import { saveCatalogItemAction } from "./catalog-actions";

describe("catalog form actions", () => {
	it("keeps an invalid price inside the form error boundary", async () => {
		const form = new FormData();
		form.set("workspaceId", "00000000-0000-4000-8000-000000000001");
		form.set("name", "HOUSE PROCESS");
		form.set("type", "physical");
		form.set("pricingModel", "fixed");
		form.set("price", "24.001");
		form.set("currency", "CAD");

		await expect(
			saveCatalogItemAction({ error: null, completionId: null }, form),
		).resolves.toEqual({
			error:
				"Enter a valid price, such as 24.00, with no more than two decimals.",
			completionId: null,
		});
		expect(create).not.toHaveBeenCalled();
	});
});
