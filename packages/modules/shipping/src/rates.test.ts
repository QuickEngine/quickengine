import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createShippingRate,
	createShippingZone,
	deleteShippingZone,
	priceChosenRate,
	quoteShipping,
	type ShippingQuoteError,
} from "./rates";

const ownerId = "shipping-rates-owner";
const workspaceId = "00000000-0000-4000-8000-0000000016a1";
const itemId = "00000000-0000-4000-8000-0000000016b1";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Rates Owner', 'rates@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Rates Workspace', 'ecommerce')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status, pricing_model, price_cents, weight_grams) values (${itemId}, ${workspaceId}, 'Heavy gem', 'physical', 'active', 'fixed', 10000, 1500)`;
});

const quote = (regionCode = "CA-AB") => ({
	destination: { countryCode: "CA", regionCode, postalCode: "T5J 0N3" },
	lines: [{ catalogItemId: itemId, quantity: 1 }],
});

describe("shipping rates", () => {
	it("uses the most specific zone and prices rounded-up kilograms", async () => {
		const canada = await createShippingZone(workspaceId, {
			name: "Canada",
			countryCodes: ["CA"],
			regionCodes: [],
			priority: 100,
			active: true,
		});
		const alberta = await createShippingZone(workspaceId, {
			name: "Alberta",
			countryCodes: ["CA"],
			regionCodes: ["CA-AB"],
			priority: 0,
			active: true,
		});
		await createShippingRate(workspaceId, {
			zoneId: canada.id,
			name: "Canada",
			baseCents: 2000,
			active: true,
		});
		const local = await createShippingRate(workspaceId, {
			zoneId: alberta.id,
			name: "Local",
			baseCents: 500,
			perKgCents: 200,
			active: true,
		});

		const result = await quoteShipping({
			workspaceId,
			quote: quote(),
			discountedSubtotalCents: 10000,
		});
		expect(result.zone.name).toBe("Alberta");
		expect(result.billableWeightGrams).toBe(1500);
		expect(result.options).toEqual([
			expect.objectContaining({ rateId: local.id, amountCents: 900 }),
		]);
	});

	it("re-prices a selected rate and applies a free-shipping threshold", async () => {
		const zone = await createShippingZone(workspaceId, {
			name: "Canada",
			countryCodes: ["CA"],
			regionCodes: [],
			priority: 0,
			active: true,
		});
		const rate = await createShippingRate(workspaceId, {
			zoneId: zone.id,
			name: "Standard",
			baseCents: 1200,
			freeOverCents: 9000,
			active: true,
		});
		await expect(
			priceChosenRate({
				workspaceId,
				rateId: rate.id,
				quote: quote(),
				discountedSubtotalCents: 9000,
			}),
		).resolves.toMatchObject({ amountCents: 0, free: true });
	});

	it("refuses weight pricing when an item has no weight", async () => {
		const sql = testDbClient();
		await sql`update catalog_items set weight_grams = null where id = ${itemId}`;
		const zone = await createShippingZone(workspaceId, {
			name: "Canada",
			countryCodes: ["CA"],
			regionCodes: [],
			priority: 0,
			active: true,
		});
		await createShippingRate(workspaceId, {
			zoneId: zone.id,
			name: "Weighted",
			baseCents: 0,
			perKgCents: 500,
			active: true,
		});
		await expect(
			quoteShipping({
				workspaceId,
				quote: quote(),
				discountedSubtotalCents: 10000,
			}),
		).rejects.toMatchObject({
			code: "MISSING_ITEM_WEIGHT",
		} satisfies Partial<ShippingQuoteError>);
	});

	it("does not silently delete rates with their zone", async () => {
		const zone = await createShippingZone(workspaceId, {
			name: "Canada",
			countryCodes: ["CA"],
			regionCodes: [],
			priority: 0,
			active: true,
		});
		await createShippingRate(workspaceId, {
			zoneId: zone.id,
			name: "Standard",
			baseCents: 1200,
			active: true,
		});
		await expect(
			deleteShippingZone(workspaceId, zone.id),
		).rejects.toMatchObject({ code: "SHIPPING_ZONE_HAS_RATES" });
	});
});
