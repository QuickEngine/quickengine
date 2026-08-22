import { createHmac, timingSafeEqual } from "node:crypto";
import type {
	SupplierConnection,
	SupplierConnectionCheck,
	SupplierFulfilmentAdapter,
	SupplierOrderPlacement,
	SupplierOrderRequest,
	SupplierShipmentNotice,
	VerifiedSupplierEvent,
} from "./provider";
import {
	type ShopifyConfig,
	type ShopifyFetch,
	shopifyGraphQL,
} from "./shopify-client";

// ─────────────────────────────────────────────────────────────────────────────
// SHOPIFY — the only file in the repository that names it.
//
// ── What this is, and firmly is not ──────────────────────────────────────────
//
// A supplier bridge. EZPZ Coffee fulfils through **Shopify Collective**, which
// requires the retailer to hold a Shopify store too. That store is
// password-protected, has no sales channels, no theme and no customers. It
// exists to tell one supplier what to make.
//
// 🔴 DO NOT BUILD, however reasonable it sounds: a Shopify storefront, theme or
// Online Store surface; a public app, OAuth flow or Partner account (this is one
// custom app, one token, entered by hand); catalog mirroring or product sync
// (QuickDash owns the catalog, and the only Shopify identifier that ever enters
// it is a variant id an operator maps); customer records in Shopify; inventory
// sync; Shopify checkout, Payments or draft orders as a checkout mechanism; or
// webhook subscriptions beyond fulfilment.
//
// ── Two constraints confirmed against Shopify's docs, 2026-08-21 ─────────────
//
// 🔴 **The order confirmation email CANNOT be disabled below Shopify Plus.** So
// suppression does not depend on a setting: the order is created with **no
// customer email**. Shopify cannot mail a buyer whose address it never received.
// The shipping address goes (EZPZ must ship somewhere); the inbox does not.
//
// 🔴 **`orderCreate` does not honour an `Idempotency-Key` header.** The tag
// search below is therefore not belt-and-braces, it is the ONLY thing standing
// between a lost response and EZPZ shipping twice at the business's expense.
//
// ⚠️ UNPROVEN until the first real test: whether Collective routes an order
// created through the Admin API the same way it routes one from Shopify's own
// checkout. Shopify's docs do not say. If it does not, a human can still press
// "Request fulfillment" in the Shopify admin, and everything else here stands.
// ─────────────────────────────────────────────────────────────────────────────

const configFor = (
	connection: SupplierConnection,
	fetchImpl?: ShopifyFetch,
	sleepImpl?: (ms: number) => Promise<void>,
): ShopifyConfig => ({
	shopDomain: connection.shopDomain,
	adminAccessToken: connection.adminAccessToken,
	apiVersion: connection.apiVersion,
	fetchImpl,
	sleepImpl,
});

const FIND_BY_TAG = `
	query FindCorrelatedOrder($query: String!) {
		orders(first: 1, query: $query) {
			nodes { id name }
		}
	}
`;

/**
 * Split a stored name into the two fields Shopify actually requires.
 *
 * 🔴 `lastName` is load-bearing. A `MailingAddressInput` carrying only
 * `firstName` is SILENTLY DISCARDED — the whole shipping address vanishes, the
 * mutation returns no `userErrors`, and the order looks fine until a supplier
 * has nowhere to ship. Verified against a live store on 2026-08-21: firstName
 * alone drops the address, lastName alone keeps it.
 *
 * ⚠️ So a single-word name goes in `lastName`, not `firstName`. That reads
 * backwards and is deliberate; the alternative is an order nobody can deliver.
 *
 * QuickDash stores one `shipToName`, because most of the world does not split
 * names the way this input wants.
 */
export function splitName(name: string | null): {
	firstName?: string;
	lastName?: string;
} {
	const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return {};
	if (parts.length === 1) return { lastName: parts[0] };
	return {
		firstName: parts.slice(0, -1).join(" "),
		lastName: parts[parts.length - 1],
	};
}

const CREATE_ORDER = `
	mutation PlaceSupplierOrder($order: OrderCreateOrderInput!) {
		orderCreate(order: $order) {
			order { id name }
			userErrors { field message }
		}
	}
`;

/**
 * The fallback trigger, for when Collective does not route on its own.
 *
 * 🔴 The one unproven assumption in this design is whether Collective acts on an
 * order created through the Admin API the same way it acts on one from Shopify's
 * checkout. If it does not, this mutation is the programmatic equivalent of a
 * human clicking "Request fulfillment" in the admin — so the failure mode is a
 * second API call, not a person doing data entry per order.
 *
 * ⚠️ Fulfilment orders cannot be created; Shopify's router makes them after an
 * order exists. So this reads them off the order rather than constructing one.
 */
const READ_FULFILMENT_ORDERS = `
	query FulfilmentOrders($id: ID!) {
		order(id: $id) {
			fulfillmentOrders(first: 10) {
				nodes { id status requestStatus }
			}
		}
	}
`;

const REQUEST_FULFILMENT = `
	mutation RequestFulfilment($id: ID!) {
		fulfillmentOrderSubmitFulfillmentRequest(id: $id) {
			originalFulfillmentOrder { id requestStatus }
			userErrors { field message }
		}
	}
`;

const RESOLVE_VARIANTS = `
	query ResolveVariants($ids: [ID!]!) {
		nodes(ids: $ids) { ... on ProductVariant { id } }
	}
`;

type FindResult = { orders: { nodes: Array<{ id: string; name: string }> } };
type CreateResult = {
	orderCreate: {
		order: { id: string; name: string } | null;
		userErrors: Array<{ field: string[] | null; message: string }>;
	};
};
type ResolveResult = { nodes: Array<{ id: string } | null> };
type FulfilmentOrdersResult = {
	order: {
		fulfillmentOrders: {
			nodes: Array<{ id: string; status: string; requestStatus: string }>;
		};
	} | null;
};
type RequestResult = {
	fulfillmentOrderSubmitFulfillmentRequest: {
		originalFulfillmentOrder: { id: string; requestStatus: string } | null;
		userErrors: Array<{ field: string[] | null; message: string }>;
	};
};

/**
 * Find an order this system already placed for the same purchase order.
 *
 * 🔴 Runs BEFORE every create. The failure it prevents is specific and nasty:
 * the mutation succeeded, the response was lost to a timeout, and the process
 * died before the reference was written. Without this, the retry places a second
 * real order and a supplier ships twice.
 */
async function findCorrelated(
	config: ShopifyConfig,
	correlationKey: string,
): Promise<{ id: string; name: string } | null> {
	const result = await shopifyGraphQL<FindResult>(
		config,
		"order lookup",
		FIND_BY_TAG,
		{ query: `tag:'${correlationKey}'` },
	);
	return result.orders.nodes[0] ?? null;
}

export function createShopifyAdapter(
	fetchImpl?: ShopifyFetch,
	sleepImpl?: (ms: number) => Promise<void>,
): SupplierFulfilmentAdapter {
	return {
		id: "shopify",

		async checkConnection(
			connection: SupplierConnection,
			supplierSkus: readonly string[],
		): Promise<SupplierConnectionCheck> {
			const config = configFor(connection, fetchImpl, sleepImpl);
			try {
				if (supplierSkus.length === 0) {
					// Nothing mapped yet is not a broken connection; it is an unfinished
					// setup, and saying "failed" would send somebody hunting a bug.
					await shopifyGraphQL<ResolveResult>(
						config,
						"variant resolution",
						RESOLVE_VARIANTS,
						{ ids: [] },
					);
					return { ok: true };
				}

				const result = await shopifyGraphQL<ResolveResult>(
					config,
					"variant resolution",
					RESOLVE_VARIANTS,
					{ ids: [...supplierSkus] },
				);
				/**
				 * 🔑 Reported BY NAME, at connect time.
				 *
				 * An unresolvable mapping found here is a typo somebody fixes in ten
				 * seconds. The same typo found when an order arrives is a paying
				 * customer waiting for coffee that was never ordered.
				 */
				const unknownSkus = supplierSkus.filter(
					(_, index) => !result.nodes[index],
				);
				return unknownSkus.length > 0
					? {
							ok: false,
							reason:
								"Some products are not recognised by this store. Check the mapping for each one listed.",
							unknownSkus,
						}
					: { ok: true };
			} catch (error) {
				return {
					ok: false,
					reason:
						error instanceof Error && error.message.includes("401")
							? "That access token was refused. Create a new one and connect again."
							: "This store could not be reached.",
				};
			}
		},

		async placeOrder(
			request: SupplierOrderRequest,
		): Promise<SupplierOrderPlacement> {
			const config = configFor(request.connection, fetchImpl, sleepImpl);

			const existing = await findCorrelated(config, request.correlationKey);
			if (existing) {
				return {
					externalOrderId: existing.id,
					externalOrderNumber: existing.name,
					correlated: true,
				};
			}

			const result = await shopifyGraphQL<CreateResult>(
				config,
				"order creation",
				CREATE_ORDER,
				{
					order: {
						lineItems: request.lines.map((line) => ({
							variantId: line.supplierSku,
							quantity: line.quantity,
							/**
							 * 🔴 Explicit, and the whole order depends on it.
							 *
							 * `orderCreate` line items default to NOT requiring shipping,
							 * whatever the variant says. An order of non-shippable lines
							 * needs no address, so Shopify then discards the shipping
							 * address as meaningless — silently, with no `userErrors`.
							 * Proven against a live store 2026-08-21.
							 */
							requiresShipping: true,
						})),
						shippingAddress: {
							...splitName(request.shipTo.name),
							address1: request.shipTo.line1 ?? undefined,
							address2: request.shipTo.line2 ?? undefined,
							city: request.shipTo.city ?? undefined,
							provinceCode: request.shipTo.region ?? undefined,
							zip: request.shipTo.postalCode ?? undefined,
							countryCode: request.shipTo.countryCode ?? undefined,
						},
						/**
						 * 🔴 No `email`, and no customer. Below Shopify Plus the order
						 * confirmation cannot be switched off, so the only reliable
						 * suppression is having nothing to send to.
						 */
						tags: [request.correlationKey],
						/**
						 * 🔴 Readable, and deliberately says nothing about the platform.
						 *
						 * Custom attributes are order DATA, not admin chrome — they can
						 * appear on packing slips and in exports, so they may travel to a
						 * supplier. "Purchase order: PO-0004" is the business's own
						 * reference and is fine for a supplier to see; `quickdash_*` told
						 * them which software the business runs, which is nobody's
						 * business but theirs.
						 */
						customAttributes: [
							{ key: "Purchase order", value: request.purchaseOrderNumber },
						],
						/**
						 * ⚠️ The correlation key lives in a METAFIELD, not an attribute.
						 *
						 * It is machine data — no human needs to read it, and it is the
						 * one value that unambiguously identifies this system. A metafield
						 * is app-scoped and is not rendered to a supplier the way an
						 * attribute can be. The searchable copy is still the tag, which is
						 * opaque.
						 */
						metafields: [
							{
								namespace: "quickdash",
								key: "correlation",
								type: "single_line_text_field",
								value: request.correlationKey,
							},
						],
						financialStatus: "PAID",
					},
				},
			);

			const failures = result.orderCreate.userErrors;
			if (failures.length > 0 || !result.orderCreate.order) {
				// ⚠️ Shopify answers 200 with `userErrors` for a refused mutation.
				// Trusting the status code alone records a failure as a success.
				throw new Error(
					`SHOPIFY_ORDER_REFUSED:${failures.map((f) => f.message).join("; ")}`,
				);
			}

			return {
				externalOrderId: result.orderCreate.order.id,
				externalOrderNumber: result.orderCreate.order.name,
				correlated: false,
			};
		},

		/**
		 * Ask the supplier to fulfil, when Collective has not asked on its own.
		 *
		 * Returns how many requests were actually submitted. Zero is a NORMAL and
		 * good outcome: it means Collective already did the work, which is the
		 * result we are hoping the first test order proves.
		 *
		 * ⚠️ Only submits for fulfilment orders whose `requestStatus` is
		 * `UNSUBMITTED`. Re-requesting one already sent is how a supplier receives
		 * the same ask twice.
		 */
		async requestFulfilment(
			connection: SupplierConnection,
			externalOrderId: string,
		): Promise<number> {
			const config = configFor(connection, fetchImpl, sleepImpl);
			const read = await shopifyGraphQL<FulfilmentOrdersResult>(
				config,
				"fulfilment order lookup",
				READ_FULFILMENT_ORDERS,
				{ id: externalOrderId },
			);

			const pending = (read.order?.fulfillmentOrders.nodes ?? []).filter(
				(node) => node.requestStatus === "UNSUBMITTED",
			);
			let submitted = 0;
			for (const node of pending) {
				const result = await shopifyGraphQL<RequestResult>(
					config,
					"fulfilment request",
					REQUEST_FULFILMENT,
					{ id: node.id },
				);
				const failures =
					result.fulfillmentOrderSubmitFulfillmentRequest.userErrors;
				if (failures.length > 0) {
					throw new Error(
						`SHOPIFY_FULFILMENT_REQUEST_REFUSED:${failures
							.map((f) => f.message)
							.join("; ")}`,
					);
				}
				submitted += 1;
			}
			return submitted;
		},

		async verifyWebhook(
			request: {
				rawBody: string;
				headers: Record<string, string | undefined>;
			},
			connection: SupplierConnection,
		): Promise<VerifiedSupplierEvent | null> {
			const secret = connection.webhookSecret;
			const presented = request.headers["x-shopify-hmac-sha256"];
			if (!secret || !presented) return null;

			const expected = createHmac("sha256", secret)
				.update(request.rawBody, "utf8")
				.digest("base64");

			// ⚠️ Length first: `timingSafeEqual` throws on a mismatch rather than
			// returning false, which would surface as a 500 instead of a rejection.
			const a = Buffer.from(expected);
			const b = Buffer.from(presented);
			if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

			/**
			 * ⚠️ Shopify signs the body ALONE — no timestamp in the base string — so
			 * the replay window used for Resend's webhooks does not transfer here.
			 * Replay safety comes from the state guards downstream instead: a
			 * shipment that already exists is not created twice.
			 */
			let payload: unknown;
			try {
				payload = JSON.parse(request.rawBody);
			} catch {
				return null;
			}

			const topic = request.headers["x-shopify-topic"] ?? "unknown";
			const order = (payload as { order_id?: number | string } | null)
				?.order_id;
			return {
				id: request.headers["x-shopify-webhook-id"] ?? `${topic}:${Date.now()}`,
				type: topic,
				externalOrderId:
					order === undefined || order === null
						? null
						: `gid://shopify/Order/${order}`,
				payload,
			};
		},

		toShipmentNotice(
			event: VerifiedSupplierEvent,
		): SupplierShipmentNotice | null {
			/**
			 * Both topics are handled because Shopify's docs do not say which fires
			 * first for a Collective fulfilment. Subscribing to one and guessing
			 * wrong means tracking never reaches the customer.
			 */
			if (
				event.type !== "fulfillments/create" &&
				event.type !== "fulfillments/update"
			) {
				return null;
			}
			if (!event.externalOrderId) return null;

			const body = event.payload as {
				tracking_company?: string | null;
				tracking_number?: string | null;
				tracking_urls?: string[] | null;
				line_items?: Array<{ sku?: string | null; quantity?: number | null }>;
			} | null;

			return {
				externalOrderId: event.externalOrderId,
				carrier: body?.tracking_company ?? null,
				trackingNumber: body?.tracking_number ?? null,
				trackingUrl: body?.tracking_urls?.[0] ?? null,
				lines: (body?.line_items ?? []).map((line) => ({
					supplierSku: line.sku ?? "",
					quantity: line.quantity ?? 0,
				})),
			};
		},
	};
}

/** The registered instance. Tests build their own with an injected `fetch`. */
export const shopifySupplierAdapter = createShopifyAdapter();
