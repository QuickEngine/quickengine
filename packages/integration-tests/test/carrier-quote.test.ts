import { setWorkspaceModuleSettings } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import {
	quoteShipping,
	ShippingQuoteError,
	saveCarrierConnection,
	setCarrierConnectionState,
} from "@quickengine/mod-shipping";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "cq-owner";
const workspaceId = "00000000-0000-4000-8000-00000011a001";
const catalogItemId = "00000000-0000-4000-8000-00000011a002";
const zoneId = "00000000-0000-4000-8000-00000011a003";

/**
 * A real Shippo test token, when one is supplied. Absent, the network-touching
 * cases are skipped and the refusal cases still run — those are the ones that
 * protect a merchant from giving delivery away, and they need no carrier.
 */
const shippoToken = process.env.SHIPPO_TEST_TOKEN;

const origin = {
	name: "Caffeinate",
	line1: "215 Clayton St NE",
	line2: null,
	city: "Atlanta",
	region: "GA",
	postalCode: "30307",
	countryCode: "US",
	phone: "+14035550100",
};
const defaultParcel = { lengthMm: 200, widthMm: 150, heightMm: 100 };

const destination = {
	countryCode: "US",
	regionCode: "CA",
	postalCode: "94103",
};

async function settings(patch: Record<string, unknown>) {
	await setWorkspaceModuleSettings({
		workspaceId,
		moduleId: "shipping",
		settings: { defaultCarrier: null, requireTracking: false, ...patch },
	});
}

async function quote() {
	return quoteShipping({
		workspaceId,
		quote: {
			destination,
			lines: [{ catalogItemId, quantity: 1 }],
		},
		discountedSubtotalCents: 4_400,
	});
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'CQ Owner', 'cq@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspaceId}, ${ownerId}, 'CQ Workspace', 'ecommerce', 'test')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'shipping', true), (${workspaceId}, 'orders', true)
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency, weight_grams)
		values (${catalogItemId}, ${workspaceId}, 'Ethiopia Guji 250g', 'physical', 'active', 'fixed', 'USD', 500)
	`;
	// 🔴 The zone asks a carrier. That is what makes every refusal below matter.
	await sql`
		insert into shipping_zones (id, workspace_id, name, country_codes, use_carrier_rates)
		values (${zoneId}, ${workspaceId}, 'United States', ARRAY['US'], true)
	`;
});

/**
 * 🔴 Every case here protects one rule: **a carrier that cannot answer must
 * refuse, never return nothing.** An empty option list renders as free
 * shipping, and a merchant who gave delivery away because an API call failed
 * has been failed by us — every order placed in that window is already gone.
 */
describe("a zone that asks a carrier for prices", () => {
	it("refuses when nobody has said where parcels ship from", async () => {
		await settings({ origin: null, defaultParcel });
		await expect(quote()).rejects.toThrow(ShippingQuoteError);
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_ORIGIN_MISSING",
		});
	});

	it("refuses when nobody has said what box they ship in", async () => {
		await settings({ origin, defaultParcel: null });
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_PARCEL_MISSING",
		});
	});

	it("refuses when no carrier account is connected", async () => {
		await settings({ origin, defaultParcel });
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_NOT_CONNECTED",
		});
	});

	/**
	 * ⚠️ A saved but unverified token is NOT a connection. Quoting through one
	 * would let a typo reach customers until the first failure, which happens in
	 * front of somebody trying to buy something.
	 */
	it("refuses a token nothing has verified yet", async () => {
		await settings({ origin, defaultParcel });
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: "shippo_test_unverified_token_value" },
		});
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_NOT_CONNECTED",
		});
	});

	it("refuses rather than quoting free when the carrier rejects the token", async () => {
		await settings({ origin, defaultParcel });
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: "shippo_test_definitelynotarealtoken" },
		});
		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			ok: true,
		});
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_UNAVAILABLE",
		});
	});

	/**
	 * 🔴 The workspace is in TEST mode, so it must reach for the test token. The
	 * live one is a different row and must never be picked up by a sandbox.
	 */
	it("will not use a live token to price a sandbox order", async () => {
		await settings({ origin, defaultParcel });
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "live",
			credentials: { apiToken: "shippo_live_should_never_be_used_here" },
		});
		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "live",
			ok: true,
		});
		await expect(quote()).rejects.toMatchObject({
			code: "CARRIER_NOT_CONNECTED",
		});
	});

	it.skipIf(!shippoToken)(
		"returns real carrier prices end to end",
		async () => {
			await settings({ origin, defaultParcel });
			await saveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
				credentials: { apiToken: shippoToken as string },
			});
			await setCarrierConnectionState({
				workspaceId,
				carrier: "shippo",
				environment: "test",
				ok: true,
			});

			const result = await quote();
			expect(result.options.length).toBeGreaterThan(0);
			expect(result.billableWeightGrams).toBe(500);
			for (const option of result.options) {
				expect(Number.isInteger(option.amountCents)).toBe(true);
				expect(option.amountCents).toBeGreaterThan(0);
				// A carrier never gives delivery away; free is the merchant's word.
				expect(option.free).toBe(false);
				// Stable across re-quotes, unlike the carrier's own rate id.
				expect(option.rateId).toMatch(/^carrier:/);
				expect(option.carrierRateId).toBeTruthy();
			}
			// Cheapest first, same contract as the band path.
			const amounts = result.options.map((option) => option.amountCents);
			expect([...amounts].sort((a, b) => a - b)).toEqual(amounts);
		},
		60_000,
	);
});
