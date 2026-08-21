import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createShopifyAdapter } from "./shopify";

const connection = {
	id: "conn_1",
	workspaceId: "ws_1",
	supplierId: "sup_1",
	provider: "shopify" as const,
	shopDomain: "caffeinate.myshopify.com",
	apiVersion: "2026-07",
	adminAccessToken: "shpat_not_a_real_token",
	webhookSecret: "whsec_not_a_real_secret",
};

/** Records every call so a test can assert ORDER of operations, not just result. */
function fakeShopify(responses: unknown[]) {
	const calls: Array<{ query: string; variables: Record<string, unknown> }> =
		[];
	let index = 0;
	const fetchImpl = (async (_url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as {
			query: string;
			variables: Record<string, unknown>;
		};
		calls.push(body);
		const payload = responses[index++];
		return {
			ok: true,
			status: 200,
			json: async () => payload,
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

const noExistingOrder = { data: { orders: { nodes: [] } } };
const createdOrder = {
	data: {
		orderCreate: {
			order: { id: "gid://shopify/Order/999", name: "#1001" },
			userErrors: [],
		},
	},
};

const request = {
	connection,
	correlationKey: "qd-po-abc",
	purchaseOrderNumber: "PO-0001",
	lines: [
		{
			supplierSku: "gid://shopify/ProductVariant/111",
			quantity: 2,
			description: "Ethiopia Guji",
		},
	],
	shipTo: {
		name: "Ada Lovelace",
		line1: "1 Hampton Crescent",
		line2: null,
		city: "Sylvan Lake",
		region: "AB",
		postalCode: "T4S 1A1",
		countryCode: "CA",
	},
	currency: "CAD",
};

describe("placing an order with a Shopify supplier", () => {
	/**
	 * 🔴 THE property that protects real money.
	 *
	 * `orderCreate` does not honour an idempotency header, so this search is the
	 * only thing preventing a second real shipment when a response is lost.
	 */
	it("searches for an order it already placed BEFORE creating one", async () => {
		const { calls, fetchImpl } = fakeShopify([noExistingOrder, createdOrder]);
		await createShopifyAdapter(fetchImpl).placeOrder(request);

		expect(calls).toHaveLength(2);
		expect(calls[0].query).toContain("FindCorrelatedOrder");
		expect(calls[0].variables.query).toBe("tag:'qd-po-abc'");
		expect(calls[1].query).toContain("PlaceSupplierOrder");
	});

	it("returns the existing order instead of creating a second one", async () => {
		const { calls, fetchImpl } = fakeShopify([
			{
				data: {
					orders: {
						nodes: [{ id: "gid://shopify/Order/555", name: "#1000" }],
					},
				},
			},
		]);

		const placement = await createShopifyAdapter(fetchImpl).placeOrder(request);

		expect(placement).toEqual({
			externalOrderId: "gid://shopify/Order/555",
			externalOrderNumber: "#1000",
			correlated: true,
		});
		// Exactly one call: the search. Nothing was created.
		expect(calls).toHaveLength(1);
	});

	/**
	 * 🔴 Below Shopify Plus the order confirmation email cannot be turned off, so
	 * withholding the address is the only suppression that cannot be undone by a
	 * setting somebody re-enables later.
	 */
	it("sends the shipping address but never the customer's email", async () => {
		const { calls, fetchImpl } = fakeShopify([noExistingOrder, createdOrder]);
		await createShopifyAdapter(fetchImpl).placeOrder(request);

		const order = (calls[1].variables as { order: Record<string, unknown> })
			.order;
		expect(order.shippingAddress).toMatchObject({ city: "Sylvan Lake" });
		expect(order).not.toHaveProperty("email");
		expect(order).not.toHaveProperty("customer");
		expect(JSON.stringify(order)).not.toContain("@");
	});

	it("carries the correlation key as a tag so the search can find it", async () => {
		const { calls, fetchImpl } = fakeShopify([noExistingOrder, createdOrder]);
		await createShopifyAdapter(fetchImpl).placeOrder(request);

		const order = (calls[1].variables as { order: Record<string, unknown> })
			.order;
		expect(order.tags).toEqual(["qd-po-abc"]);
		expect(order.financialStatus).toBe("PAID");
	});

	/**
	 * ⚠️ Shopify answers 200 with a `userErrors` array for a refused mutation.
	 * Trusting the status code records a failure as a success, and the purchase
	 * order would read as sent while no supplier ever heard of it.
	 */
	it("treats a 200 carrying userErrors as a failure", async () => {
		const { fetchImpl } = fakeShopify([
			noExistingOrder,
			{
				data: {
					orderCreate: {
						order: null,
						userErrors: [
							{ field: ["lineItems"], message: "Variant not found" },
						],
					},
				},
			},
		]);

		await expect(
			createShopifyAdapter(fetchImpl).placeOrder(request),
		).rejects.toThrow(/SHOPIFY_ORDER_REFUSED.*Variant not found/);
	});
});

describe("verifying a Shopify webhook", () => {
	const body = JSON.stringify({
		order_id: 999,
		tracking_company: "Canada Post",
		tracking_number: "TRACK123",
		tracking_urls: ["https://example.test/TRACK123"],
		line_items: [{ sku: "EZPZ-ETH-250", quantity: 2 }],
	});
	const signature = createHmac("sha256", connection.webhookSecret)
		.update(body, "utf8")
		.digest("base64");

	it("accepts a correctly signed delivery", async () => {
		const event = await createShopifyAdapter().verifyWebhook(
			{
				rawBody: body,
				headers: {
					"x-shopify-hmac-sha256": signature,
					"x-shopify-topic": "fulfillments/create",
					"x-shopify-webhook-id": "evt_1",
				},
			},
			connection,
		);
		expect(event?.externalOrderId).toBe("gid://shopify/Order/999");
	});

	it("returns null for a bad signature rather than throwing", async () => {
		// Throwing would surface as a 500. A forged delivery must be a flat refusal.
		const event = await createShopifyAdapter().verifyWebhook(
			{
				rawBody: body,
				headers: {
					"x-shopify-hmac-sha256": "not-the-signature",
					"x-shopify-topic": "fulfillments/create",
				},
			},
			connection,
		);
		expect(event).toBeNull();
	});

	it("returns null when the body was altered after signing", async () => {
		const event = await createShopifyAdapter().verifyWebhook(
			{
				rawBody: body.replace("TRACK123", "TRACK999"),
				headers: {
					"x-shopify-hmac-sha256": signature,
					"x-shopify-topic": "fulfillments/create",
				},
			},
			connection,
		);
		expect(event).toBeNull();
	});

	it("reads tracking off both fulfilment topics and ignores the rest", async () => {
		const adapter = createShopifyAdapter();
		for (const topic of ["fulfillments/create", "fulfillments/update"]) {
			const notice = adapter.toShipmentNotice({
				id: "evt_1",
				type: topic,
				externalOrderId: "gid://shopify/Order/999",
				payload: JSON.parse(body),
			});
			expect(notice).toMatchObject({
				carrier: "Canada Post",
				trackingNumber: "TRACK123",
				trackingUrl: "https://example.test/TRACK123",
			});
		}

		// A topic we do not act on yields null, which the route answers 200 to —
		// Shopify disables endpoints that keep failing.
		expect(
			adapter.toShipmentNotice({
				id: "evt_2",
				type: "orders/updated",
				externalOrderId: "gid://shopify/Order/999",
				payload: {},
			}),
		).toBeNull();
	});
});

describe("checking a Shopify connection", () => {
	it("names every mapping the store does not recognise", async () => {
		const { fetchImpl } = fakeShopify([
			{
				data: {
					nodes: [{ id: "gid://shopify/ProductVariant/111" }, null],
				},
			},
		]);

		const check = await createShopifyAdapter(fetchImpl).checkConnection(
			connection,
			["gid://shopify/ProductVariant/111", "gid://shopify/ProductVariant/222"],
		);

		expect(check.ok).toBe(false);
		// 🔑 By name, so a typo is fixed on a settings screen rather than
		// discovered by a customer waiting for coffee.
		expect(check.unknownSkus).toEqual(["gid://shopify/ProductVariant/222"]);
	});

	it("passes when every mapping resolves", async () => {
		const { fetchImpl } = fakeShopify([
			{ data: { nodes: [{ id: "gid://shopify/ProductVariant/111" }] } },
		]);
		const check = await createShopifyAdapter(fetchImpl).checkConnection(
			connection,
			["gid://shopify/ProductVariant/111"],
		);
		expect(check).toEqual({ ok: true });
	});
});
