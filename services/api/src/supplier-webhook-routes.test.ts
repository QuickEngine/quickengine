import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it, vi } from "vitest";
import type { ApiLogger } from "./logger";
import type { PlatformEnv } from "./platform-types";

const WORKSPACE = "00000000-0000-4000-8000-0000000019a1";
const SUPPLIER = "00000000-0000-4000-8000-0000000019b1";

const resolveSupplierConnection = vi.fn();
const recordSupplierShipmentNotice = vi.fn();
const verifyWebhook = vi.fn();
const toShipmentNotice = vi.fn();

vi.mock("@quickengine/mod-inventory", () => ({
	isAutomatedHandoff: (method: string) => method === "shopify",
	getSupplierAdapter: () => ({ verifyWebhook, toShipmentNotice }),
	resolveSupplierConnection: (input: unknown) =>
		resolveSupplierConnection(input),
}));

/**
 * ⚠️ The coordinator is mocked here on purpose. What it commits is proven
 * against a real database in `purchase-orders.test.ts` and the shipping tests;
 * this file proves the HTTP contract around it.
 */
vi.mock("./supplier-shipment", () => ({
	recordSupplierShipmentNotice: (input: unknown) =>
		recordSupplierShipmentNotice(input),
}));

const logger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
} as unknown as ApiLogger;

async function appFor() {
	const { registerSupplierWebhookRoutes } = await import(
		"./supplier-webhook-routes"
	);
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId({ headerName: "X-Request-Id" }));
	registerSupplierWebhookRoutes(app, { logger });
	return app;
}

const post = async (
	path: string,
	body = "{}",
	headers: Record<string, string> = {},
) => (await appFor()).request(path, { method: "POST", body, headers });

const connected = {
	id: "conn_1",
	workspaceId: WORKSPACE,
	supplierId: SUPPLIER,
	provider: "shopify",
	shopDomain: "caffeinate.myshopify.com",
	apiVersion: "2026-07",
	adminAccessToken: "shpat_x",
	webhookSecret: "whsec_x",
};

const path = `/webhooks/supplier/shopify/${WORKSPACE}/${SUPPLIER}`;

describe("inbound supplier webhooks", () => {
	it("404s an unknown provider or a malformed id without querying anything", async () => {
		resolveSupplierConnection.mockClear();

		expect(
			(await post(`/webhooks/supplier/carrier-pigeon/${WORKSPACE}/${SUPPLIER}`))
				.status,
		).toBe(404);
		expect(
			(await post(`/webhooks/supplier/shopify/not-a-uuid/${SUPPLIER}`)).status,
		).toBe(404);

		// 🔴 Shape-checked before any database work, so a scan cannot make us query.
		expect(resolveSupplierConnection).not.toHaveBeenCalled();
	});

	/**
	 * 🔴 A missing connection and a forged signature answer IDENTICALLY. Neither
	 * response reveals which it was, so a caller cannot probe for which suppliers
	 * are connected.
	 */
	it("refuses with 400 and no reason when there is no connection", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(null);

		const response = await post(path);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid signature." });
	});

	it("refuses with 400 and no reason when the signature is bad", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce(null);

		const response = await post(path);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid signature." });
		expect(recordSupplierShipmentNotice).not.toHaveBeenCalled();
	});

	/**
	 * ⚠️ Checked only AFTER verification. A correctly signed event delivered to
	 * the wrong workspace's endpoint would otherwise attach one business's
	 * tracking to another's order.
	 */
	it("refuses a verified event that came from a different shop", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_1",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/1",
			payload: {},
		});

		const response = await post(path, "{}", {
			"x-shopify-shop-domain": "someone-else.myshopify.com",
		});
		expect(response.status).toBe(400);
		expect(recordSupplierShipmentNotice).not.toHaveBeenCalled();
	});

	/**
	 * ⚠️ 200, not 4xx. Providers disable endpoints that keep failing, and losing
	 * the topic we care about because we rejected the ones we do not is a slow,
	 * quiet outage.
	 */
	it("answers 200 for a topic it does not act on", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_2",
			type: "orders/updated",
			externalOrderId: null,
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce(null);

		expect((await post(path)).status).toBe(200);
		expect(recordSupplierShipmentNotice).not.toHaveBeenCalled();
	});

	it("records a shipment and answers 200", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_3",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/9",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/9",
			carrier: "Canada Post",
			trackingNumber: "TRACK1",
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: true,
			purchaseOrderId: "po_1",
			orderId: "ord_1",
			shipmentId: "shp_1",
		});

		expect((await post(path)).status).toBe(200);
		expect(recordSupplierShipmentNotice).toHaveBeenCalledWith(
			expect.objectContaining({ trackingNumber: "TRACK1" }),
		);
	});

	/**
	 * 🔴 A supplier believes it shipped and QuickDash has no record of asking.
	 * Answered 200 so it is not redelivered forever, but logged at ERROR —
	 * staying silent is how the Stripe refund defect survived three PRs.
	 */
	it("answers 200 but logs loudly for an order it never placed", async () => {
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_4",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/404",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/404",
			carrier: null,
			trackingNumber: null,
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: false,
			reason: "unknown",
		});

		expect((await post(path)).status).toBe(200);
		expect(logger.error).toHaveBeenCalledWith(
			"supplier.webhook.unmatched_shipment",
			expect.objectContaining({ externalOrderId: "gid://shopify/Order/404" }),
		);
	});

	/**
	 * ⚠️ A reference this workspace DID issue but never dispatched. Distinct from
	 * a redelivery, and logged for a person rather than swallowed.
	 */
	it("logs loudly when a supplier ships something never sent to it", async () => {
		vi.mocked(logger.error).mockClear();
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_6",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/77",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/77",
			carrier: null,
			trackingNumber: null,
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: false,
			reason: "not-sent",
		});

		expect((await post(path)).status).toBe(200);
		expect(logger.error).toHaveBeenCalledWith(
			"supplier.webhook.unmatched_shipment",
			expect.objectContaining({ reason: "not-sent" }),
		);
	});

	/**
	 * 🔴 The supplier shipped, the tracking is recorded, and yet NOTHING reached
	 * the buyer. From the customer's side that is indistinguishable from the
	 * parcel never being sent, so it must be as loud as an outright failure.
	 */
	it("logs loudly when tracking is recorded but no customer shipment exists", async () => {
		vi.mocked(logger.error).mockClear();
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_7",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/12",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/12",
			carrier: "Canada Post",
			trackingNumber: "TRK12",
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: true,
			purchaseOrderId: "po_12",
			orderId: "ord_12",
			shipmentId: null,
		});

		expect((await post(path)).status).toBe(200);
		expect(logger.error).toHaveBeenCalledWith(
			"supplier.webhook.shipment_not_shown",
			expect.objectContaining({ purchaseOrderId: "po_12" }),
		);
	});

	/** An order cancelled or already fulfilled. A person has to sort it out. */
	it("logs loudly when the order cannot receive a shipment", async () => {
		vi.mocked(logger.error).mockClear();
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_8",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/13",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/13",
			carrier: null,
			trackingNumber: null,
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: false,
			reason: "order-not-shippable",
		});

		expect((await post(path)).status).toBe(200);
		expect(logger.error).toHaveBeenCalledWith(
			"supplier.webhook.unmatched_shipment",
			expect.objectContaining({ reason: "order-not-shippable" }),
		);
	});

	it("stays quiet on a redelivery of one already recorded", async () => {
		vi.mocked(logger.error).mockClear();
		resolveSupplierConnection.mockResolvedValueOnce(connected);
		verifyWebhook.mockResolvedValueOnce({
			id: "evt_5",
			type: "fulfillments/create",
			externalOrderId: "gid://shopify/Order/9",
			payload: {},
		});
		toShipmentNotice.mockReturnValueOnce({
			externalOrderId: "gid://shopify/Order/9",
			carrier: null,
			trackingNumber: null,
			trackingUrl: null,
			lines: [],
		});
		recordSupplierShipmentNotice.mockResolvedValueOnce({
			applied: false,
			reason: "already-shipped",
		});

		// At-least-once delivery makes this the NORMAL case, not a divergence.
		expect((await post(path)).status).toBe(200);
		expect(logger.error).not.toHaveBeenCalled();
	});
});
