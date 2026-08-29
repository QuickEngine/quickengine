import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createShopifyAdapter, splitName, tagFor } from "./shopify";

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
type Reply = unknown | { httpStatus: number; retryAfter?: string };

function isHttpReply(
	reply: Reply,
): reply is { httpStatus: number; retryAfter?: string } {
	return Boolean(reply && typeof reply === "object" && "httpStatus" in reply);
}

function fakeShopify(responses: Reply[]) {
	const calls: Array<{ query: string; variables: Record<string, unknown> }> =
		[];
	const waits: number[] = [];
	let index = 0;
	const fetchImpl = (async (_url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as {
			query: string;
			variables: Record<string, unknown>;
		};
		calls.push(body);
		const reply = responses[index++];
		if (isHttpReply(reply)) {
			return {
				ok: false,
				status: reply.httpStatus,
				headers: { get: () => reply.retryAfter ?? null },
				json: async () => ({}),
			} as unknown as Response;
		}
		return {
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: async () => reply,
		} as unknown as Response;
	}) as unknown as typeof fetch;
	// Records the wait instead of taking it, so backoff is asserted not endured.
	const sleepImpl = async (ms: number) => {
		waits.push(ms);
	};
	return { calls, waits, fetchImpl, sleepImpl };
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
		// The TAG, not the raw key: Shopify refuses a tag over 40 characters, so
		// the key is derived. Search and create must derive it the same way or the
		// duplicate guard stops finding its own orders.
		expect(calls[0].variables.query).toBe(`tag:'${tagFor("qd-po-abc")}'`);
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

		/**
		 * 🔴 Proven against a live Shopify store, 2026-08-21: an address with only
		 * `firstName` is SILENTLY DISCARDED, and a line item defaults to not
		 * requiring shipping. Either one alone leaves the supplier with nowhere to
		 * ship and no error to explain it.
		 */
		expect(order.shippingAddress).toMatchObject({
			lastName: expect.stringMatching(/\S/),
		});
		expect(order.lineItems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ requiresShipping: true }),
			]),
		);
		expect(order).not.toHaveProperty("customer");
		expect(JSON.stringify(order)).not.toContain("@");

		/**
		 * 🔴 Nothing a supplier might read names the platform.
		 *
		 * Custom attributes are order DATA — they reach packing slips and exports,
		 * so they can travel to a supplier. The business's own purchase order
		 * number is fine for them to see; which software the business runs is not.
		 * The correlation key lives in an app-scoped metafield instead.
		 */
		const attributes = JSON.stringify(order.customAttributes);
		expect(attributes.toLowerCase()).not.toContain("quickdash");
		expect(attributes.toLowerCase()).not.toContain("quickengine");
		expect(order.customAttributes).toEqual([
			{ key: "Purchase order", value: "PO-0001" },
		]);
	});

	it("carries the correlation key as a tag so the search can find it", async () => {
		const { calls, fetchImpl } = fakeShopify([noExistingOrder, createdOrder]);
		await createShopifyAdapter(fetchImpl).placeOrder(request);

		const order = (calls[1].variables as { order: Record<string, unknown> })
			.order;
		expect(order.tags).toEqual([tagFor("qd-po-abc")]);
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

describe("surviving Shopify's rate limit", () => {
	const throttled = {
		errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
	};

	/**
	 * ⚠️ The Admin API is a leaky bucket, roughly 40 points a second, and
	 * `orderCreate` costs 10. A burst of paid orders will hit it, and an
	 * un-retried throttle means a supplier never hears about somebody's coffee.
	 */
	it("retries a 429 and honours Retry-After", async () => {
		const { calls, waits, fetchImpl, sleepImpl } = fakeShopify([
			{ httpStatus: 429, retryAfter: "2" },
			noExistingOrder,
			createdOrder,
		]);

		const placement = await createShopifyAdapter(
			fetchImpl,
			sleepImpl,
		).placeOrder(request);

		expect(placement.correlated).toBe(false);
		expect(calls).toHaveLength(3);
		// Shopify's own number, not a guess: 2 seconds.
		expect(waits).toEqual([2000]);
	});

	/**
	 * 🔴 GraphQL throttling arrives as 200 with a THROTTLED code, NOT a 429.
	 * Treating status alone as success marks a throttled order permanently failed.
	 */
	it("retries a 200 that carries a THROTTLED error code", async () => {
		const { calls, waits, fetchImpl, sleepImpl } = fakeShopify([
			throttled,
			noExistingOrder,
			createdOrder,
		]);

		await createShopifyAdapter(fetchImpl, sleepImpl).placeOrder(request);

		expect(calls).toHaveLength(3);
		expect(waits).toHaveLength(1);
	});

	it("does not retry a permanent failure", async () => {
		// A 401 is a settled answer. Retrying it four times delays the truth.
		const { calls, fetchImpl, sleepImpl } = fakeShopify([{ httpStatus: 401 }]);

		await expect(
			createShopifyAdapter(fetchImpl, sleepImpl).placeOrder(request),
		).rejects.toThrow(/401/);
		expect(calls).toHaveLength(1);
	});

	it("gives up after its attempt budget rather than looping forever", async () => {
		const { calls, fetchImpl, sleepImpl } = fakeShopify([
			{ httpStatus: 429 },
			{ httpStatus: 429 },
			{ httpStatus: 429 },
			{ httpStatus: 429 },
		]);

		await expect(
			createShopifyAdapter(fetchImpl, sleepImpl).placeOrder(request),
		).rejects.toThrow(/429/);
		expect(calls).toHaveLength(4);
	});
});

describe("asking a supplier to fulfil when Collective did not", () => {
	/**
	 * 🔴 The fallback for the one unproven assumption: whether Collective routes
	 * an order created through the Admin API at all. If it does not, this is the
	 * programmatic equivalent of clicking "Request fulfillment".
	 */
	it("submits only the fulfilment orders nobody has requested yet", async () => {
		const { calls, fetchImpl } = fakeShopify([
			{
				data: {
					order: {
						fulfillmentOrders: {
							nodes: [
								{ id: "fo_1", status: "OPEN", requestStatus: "UNSUBMITTED" },
								{ id: "fo_2", status: "OPEN", requestStatus: "SUBMITTED" },
							],
						},
					},
				},
			},
			{
				data: {
					fulfillmentOrderSubmitFulfillmentRequest: {
						originalFulfillmentOrder: {
							id: "fo_1",
							requestStatus: "SUBMITTED",
						},
						userErrors: [],
					},
				},
			},
		]);

		const submitted = await createShopifyAdapter(fetchImpl).requestFulfilment?.(
			connection,
			"gid://shopify/Order/999",
		);

		expect(submitted).toBe(1);
		// ⚠️ `fo_2` was already submitted. Re-requesting it would ask the supplier
		// for the same coffee twice.
		expect(calls).toHaveLength(2);
		expect(calls[1].variables.id).toBe("fo_1");
	});

	it("reports zero when Collective already did the work", async () => {
		// 🔑 Zero is the GOOD outcome, and the result the first test order is
		// hoping for. It must not read as a failure.
		const { fetchImpl } = fakeShopify([
			{
				data: {
					order: {
						fulfillmentOrders: {
							nodes: [
								{ id: "fo_1", status: "OPEN", requestStatus: "SUBMITTED" },
							],
						},
					},
				},
			},
		]);

		expect(
			await createShopifyAdapter(fetchImpl).requestFulfilment?.(
				connection,
				"gid://shopify/Order/999",
			),
		).toBe(0);
	});
});

/**
 * 🔴 The name split, tested directly because getting it wrong is invisible.
 *
 * Shopify accepts an address with no `lastName` and then throws it away —
 * no error, no warning, and the order looks correct in every other respect
 * until a supplier has nowhere to send the goods.
 */
describe("splitting a stored name for Shopify", () => {
	it("puts the last word in lastName, which is the field that matters", () => {
		expect(splitName("Ada Lovelace")).toEqual({
			firstName: "Ada",
			lastName: "Lovelace",
		});
	});

	it("keeps every middle part with the first name", () => {
		expect(splitName("Ada King Lovelace")).toEqual({
			firstName: "Ada King",
			lastName: "Lovelace",
		});
	});

	/**
	 * ⚠️ Reads backwards on purpose. A single word in `firstName` loses the whole
	 * address; the same word in `lastName` keeps it.
	 */
	it("puts a single-word name in lastName, not firstName", () => {
		expect(splitName("Prince")).toEqual({ lastName: "Prince" });
	});

	it("gives back nothing for a name it does not have", () => {
		expect(splitName(null)).toEqual({});
		expect(splitName("   ")).toEqual({});
	});
});
