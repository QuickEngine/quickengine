import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createCatalogItem,
	createProductVariant,
	deleteCatalogItem,
	getCatalogItem,
	getProductVariant,
	listCatalogItems,
	setCatalogItemStatus,
	setProductVariantStatus,
} from "../src";

const ownerId = "catalog-owner";
const workspaceId = "00000000-0000-4000-8000-000000000801";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000802";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Catalog Owner', 'catalog@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Catalog', 'retail'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'retail')`;
});

describe("Products & Services persistence", () => {
	it("scopes reads and lifecycle operations to one workspace", async () => {
		const item = await createCatalogItem(workspaceId, {
			name: "Gemstone",
			type: "physical",
			priceCents: 2500,
		});
		expect(await getCatalogItem(otherWorkspaceId, item.id)).toBeUndefined();
		expect(await listCatalogItems(otherWorkspaceId)).toEqual([]);
		await expect(
			setCatalogItemStatus(otherWorkspaceId, item.id, "active"),
		).rejects.toThrow("CATALOG_ITEM_NOT_FOUND");
	});

	it("keeps item and variant SKUs unique across the workspace", async () => {
		const item = await createCatalogItem(workspaceId, {
			name: "Shirt",
			type: "physical",
			sku: "SHIRT",
			priceCents: 3000,
		});
		await expect(
			createProductVariant(workspaceId, item.id, {
				options: [{ name: "Size", value: "Large" }],
				sku: "SHIRT",
			}),
		).rejects.toThrow("CATALOG_SKU_IN_USE");
	});

	it("requires an active parent and archives variants with their parent", async () => {
		const item = await createCatalogItem(workspaceId, {
			name: "Print",
			type: "physical",
			priceCents: 1200,
		});
		const variant = await createProductVariant(workspaceId, item.id, {
			options: [{ name: "Paper", value: "Glossy" }],
		});
		await expect(
			setProductVariantStatus(workspaceId, variant.id, "active"),
		).rejects.toThrow("VARIANT_PARENT_NOT_ACTIVE");
		await setCatalogItemStatus(workspaceId, item.id, "active");
		await setProductVariantStatus(workspaceId, variant.id, "active");
		await setCatalogItemStatus(workspaceId, item.id, "archived");
		expect((await getProductVariant(workspaceId, variant.id))?.status).toBe(
			"archived",
		);
	});

	it("permanently deletes only archived catalog records", async () => {
		const item = await createCatalogItem(workspaceId, {
			name: "Consulting",
			type: "service",
			pricingModel: "hourly",
			priceCents: 10000,
		});
		await expect(deleteCatalogItem(workspaceId, item.id)).rejects.toThrow(
			"CATALOG_ITEM_MUST_BE_ARCHIVED",
		);
		await setCatalogItemStatus(workspaceId, item.id, "archived");
		expect((await deleteCatalogItem(workspaceId, item.id))?.id).toBe(item.id);
	});
});
