// ─────────────────────────────────────────────────────────────────────────────
// THE SUPPLIER FULFILMENT SEAM.
//
// 🔴 Every call that leaves this system to ask a supplier for goods crosses this
// interface. Nothing above it may import a provider SDK, name Shopify, or assume
// Shopify.
//
// ── Why it exists ────────────────────────────────────────────────────────────
//
// The first real supplier reaches its fulfilment through Shopify Collective, and
// building straight to that would make Shopify the shape of the feature. It is
// not: a supplier needs the SKU, the quantity and the ship-to address, and needs
// to return a tracking number. Collective is one transport for that, the same
// way email or a CSV drop or a supplier's own API are. `suppliers.handoffMethod`
// has said so since migration 0074 — `manual | email | csv | api | portal |
// shopify | woocommerce` — and this interface is the missing half.
//
// The record below the seam is ALREADY provider-agnostic: a purchase order has
// `handoffMethod`, `supplierReference` and a status, and none of them mention a
// vendor.
//
// ⚠️ Read `packages/modules/payments/src/provider.ts` before changing anything
// here. This is deliberately its twin, because that seam has already survived a
// second provider arriving and the lessons are paid for.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a supplier is reached, as stored in `suppliers.handoff_method`.
 *
 * ⚠️ These strings reach the database. Renaming one orphans every supplier
 * configured under the old name, so treat them as permanent identifiers rather
 * than display labels.
 */
export type SupplierHandoffMethod =
	| "unknown"
	| "manual"
	| "email"
	| "csv"
	| "api"
	| "portal"
	| "shopify"
	| "woocommerce";

/** A resolved, decrypted connection. Only ever built server-side. */
export type SupplierConnection = {
	id: string;
	workspaceId: string;
	supplierId: string;
	provider: SupplierHandoffMethod;
	shopDomain: string;
	apiVersion: string;
	/** Legacy permanent token, or client credentials below. One is required. */
	adminAccessToken?: string;
	clientId?: string;
	clientSecret?: string;
	webhookSecret?: string;
};

/** Where the supplier is sending the goods. Snapshotted, never a live join. */
export type SupplierShipTo = {
	name: string | null;
	line1: string | null;
	line2: string | null;
	city: string | null;
	region: string | null;
	postalCode: string | null;
	countryCode: string | null;
	/**
	 * ⚠️ Deliberately optional and normally ABSENT.
	 *
	 * A supplier needs an address to ship to; it does not need the buyer's inbox.
	 * Withholding it is the one suppression layer that cannot be undone by a
	 * setting somebody re-enables later — the provider cannot email a customer
	 * whose address it was never given. Populate only where a supplier genuinely
	 * requires a contact, and then with an operations mailbox, never the buyer's.
	 */
	email?: string | null;
	phone?: string | null;
};

/** One line of what is being asked for, in the SUPPLIER's own vocabulary. */
export type SupplierOrderLine = {
	/** Sent verbatim, never parsed. See `supplier_skus.supplierSku`. */
	supplierSku: string;
	quantity: number;
	/** For a human reading the order, never for matching. */
	description: string | null;
};

/** What the adapter is being asked to place. */
export type SupplierOrderRequest = {
	connection: SupplierConnection;
	/**
	 * 🔴 The correlation key, and the whole duplicate-order defence.
	 *
	 * Derived from the purchase order id, so it is STABLE across retries.
	 * `placeOrder` must search the provider for it BEFORE creating anything —
	 * that is what saves a supplier from shipping twice when a call succeeded and
	 * the response was lost.
	 */
	correlationKey: string;
	/** Human-facing reference, for the supplier's paperwork. */
	purchaseOrderNumber: string;
	lines: readonly SupplierOrderLine[];
	shipTo: SupplierShipTo;
	currency: string;
};

export type SupplierOrderPlacement = {
	/** The provider's id for the order. Stored as `purchase_orders.supplierReference`. */
	externalOrderId: string;
	/** What a human sees in the provider's admin. */
	externalOrderNumber: string | null;
	/**
	 * True when this call FOUND an order it had already placed rather than
	 * creating one. The caller records the reference either way; the difference
	 * matters only for what it logs.
	 */
	correlated: boolean;
};

/**
 * An inbound event whose authenticity has already been PROVEN.
 *
 * 🔴 Only ever produced by `verifyWebhook`. Constructing one anywhere else
 * defeats the signature check, which is the only thing standing between a
 * stranger and a forged "your order shipped".
 */
export type VerifiedSupplierEvent = {
	/** The provider's event id, for logs and nothing else. */
	id: string;
	/** The provider's topic, e.g. a fulfilment created. */
	type: string;
	/** The supplier-side order this concerns, when the event names one. */
	externalOrderId: string | null;
	payload: unknown;
};

/** A supplier saying it has shipped, normalised. */
export type SupplierShipmentNotice = {
	externalOrderId: string;
	carrier: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	lines: readonly { supplierSku: string; quantity: number }[];
};

export type SupplierConnectionCheck = {
	ok: boolean;
	/** Plain enough for an operator to act on. Never a raw provider error. */
	reason?: string;
	/**
	 * Mapped SKUs the provider does not recognise, by name.
	 *
	 * 🔑 Surfaced at CONNECT time on purpose. An unresolvable SKU discovered when
	 * an order arrives is a paying customer waiting for coffee; the same fact on a
	 * settings screen is a typo somebody fixes in ten seconds.
	 */
	unknownSkus?: readonly string[];
};

export interface SupplierFulfilmentAdapter {
	readonly id: SupplierHandoffMethod;

	/** Cheap pre-flight: does this connection work, and does the mapping resolve? */
	checkConnection(
		connection: SupplierConnection,
		supplierSkus: readonly string[],
	): Promise<SupplierConnectionCheck>;

	/**
	 * Place the order with the supplier.
	 *
	 * 🔴 MUST be safe to call twice for the same `correlationKey`. Implementations
	 * search for a prior placement before creating anything, and return
	 * `correlated: true` when they find one. At-least-once delivery guarantees
	 * this will happen; a duplicate here costs a real shipment.
	 */
	placeOrder(request: SupplierOrderRequest): Promise<SupplierOrderPlacement>;

	/**
	 * Ask the supplier to fulfil an order already placed, when the provider did
	 * not ask on its own.
	 *
	 * Optional: most transports have no equivalent. Returns how many requests
	 * were submitted, where **zero is the good outcome** — it means the provider
	 * had already done it.
	 */
	requestFulfilment?(
		connection: SupplierConnection,
		externalOrderId: string,
	): Promise<number>;

	/**
	 * 🔴 Takes the RAW body, never a parsed object.
	 *
	 * Signatures are computed over exact bytes, so parsing and re-serialising
	 * silently breaks verification. Returns null on a bad signature; callers
	 * answer 400 and do no work.
	 */
	verifyWebhook(
		request: {
			rawBody: string;
			headers: Record<string, string | undefined>;
		},
		connection: SupplierConnection,
	): Promise<VerifiedSupplierEvent | null>;

	/**
	 * Turn a verified event into a shipment notice, or null for one we ignore.
	 *
	 * ⚠️ Returning null must lead to a 200, not an error. Providers disable
	 * endpoints that keep failing, and losing the topic we care about because we
	 * rejected the ones we do not is a slow, quiet outage.
	 */
	toShipmentNotice(event: VerifiedSupplierEvent): SupplierShipmentNotice | null;
}
