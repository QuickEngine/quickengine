export type QuickSecretCredential = {
	type: "secret";
	token: string;
};

export type QuickScopedCredential = {
	type: "scoped";
	token: string;
};

export type QuickPublishableCredential = {
	type: "publishable";
	key: string;
};

export type QuickSessionCredential = {
	type: "session";
};

export type QuickCredential =
	| QuickSecretCredential
	| QuickScopedCredential
	| QuickPublishableCredential
	| QuickSessionCredential;

export type QuickServerCredential =
	| QuickSecretCredential
	| QuickScopedCredential;

export type QuickBrowserCredential =
	| QuickPublishableCredential
	| QuickSessionCredential;

export type QuickClientOptions<
	TCredential extends QuickCredential = QuickCredential,
> = {
	baseUrl: string;
	workspaceId: string;
	credential: TCredential;
	fetcher?: typeof fetch;
	apiVersion?: string;
};

export type QuickRequestOptions = Omit<RequestInit, "body" | "method"> & {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	idempotencyKey?: string;
};

export type QuickResponse<TData> = {
	data: TData;
	requestId: string | null;
};

export type QuickClientRecord = {
	id: string;
	workspaceId: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string | null;
	notes: string | null;
	fields: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type QuickClientInput = {
	name: string;
	email?: string | null;
	phone?: string | null;
	company?: string | null;
	notes?: string | null;
	fields?: Record<string, unknown>;
};

export type QuickClientAddress = {
	id: string;
	workspaceId: string;
	clientId: string;
	label: string | null;
	line1: string;
	line2: string | null;
	city: string;
	region: string | null;
	postalCode: string | null;
	countryCode: string;
	createdAt: string;
	updatedAt: string;
};

export type QuickClientAddressInput = {
	label?: string | null;
	line1: string;
	line2?: string | null;
	city: string;
	region?: string | null;
	postalCode?: string | null;
	countryCode: string;
};

export type QuickCursorPage<T> = {
	items: T[];
	page: { hasMore: boolean; nextCursor: string | null };
};

export type QuickApiErrorBody = {
	code?: string;
	message?: string;
	details?: unknown;
};

export type QuickCatalogItemType =
	| "physical"
	| "digital"
	| "service"
	| "package"
	| "rental";
export type QuickPricingModel =
	| "fixed"
	| "starting_at"
	| "hourly"
	| "custom_quote"
	| "free";
export type QuickCatalogStatus = "draft" | "active" | "archived";
export type QuickVariantOption = { name: string; value: string };

/**
 * A catalog item, as returned by the `/v1/catalog` routes. One transparent shape for both the
 * admin surface (all statuses) and the storefront (a publishable key is clamped to `active`).
 */
export type QuickCatalogItem = {
	id: string;
	workspaceId: string;
	name: string;
	description: string | null;
	type: QuickCatalogItemType;
	status: QuickCatalogStatus;
	sku: string | null;
	pricingModel: QuickPricingModel;
	priceCents: number | null;
	currency: string;
	unitLabel: string | null;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

/** A variant of a catalog item, as returned by the `/v1/catalog/:id/variants` and `/v1/variants` routes. */
export type QuickCatalogVariant = {
	id: string;
	workspaceId: string;
	catalogItemId: string;
	combinationKey: string;
	options: QuickVariantOption[];
	status: QuickCatalogStatus;
	sku: string | null;
	priceCentsOverride: number | null;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

/** Body for creating a catalog item over `POST /v1/catalog`. */
export type QuickCatalogItemInput = {
	name: string;
	type: QuickCatalogItemType;
	description?: string | null;
	status?: QuickCatalogStatus;
	sku?: string | null;
	pricingModel?: QuickPricingModel;
	priceCents?: number | null;
	currency?: string;
	unitLabel?: string | null;
	metadata?: Record<string, unknown>;
};

/** Body for creating a variant over `POST /v1/catalog/:id/variants`. */
export type QuickCatalogVariantInput = {
	options: QuickVariantOption[];
	status?: QuickCatalogStatus;
	sku?: string | null;
	priceCentsOverride?: number | null;
	metadata?: Record<string, unknown>;
};

export type QuickQuoteKind = "quote" | "estimate" | "proposal";
export type QuickQuoteStatus =
	| "draft"
	| "sent"
	| "accepted"
	| "declined"
	| "expired"
	| "voided"
	| "superseded"
	| "converted";

/** A line on a quote or estimate. `catalogItemId` links it to the catalog; omit for a free line. */
export type QuickQuoteLineInput = {
	name: string;
	quantity: number | string;
	unitPriceCents: number;
	catalogItemId?: string | null;
	catalogItemVariantId?: string | null;
	description?: string | null;
	sku?: string | null;
	unitLabel?: string | null;
	metadata?: Record<string, unknown>;
};

/** Body for creating a quote over `POST /v1/quotes`. */
export type QuickQuoteInput = {
	clientId: string;
	title: string;
	lines: QuickQuoteLineInput[];
	kind?: QuickQuoteKind;
	currency?: string;
	validUntil?: string | null;
	notes?: string | null;
	terms?: string | null;
	taxCents?: number;
	metadata?: Record<string, unknown>;
};

/** Body for accepting a quote over `POST /v1/quotes/:id/accept`. */
export type QuickQuoteAcceptance = {
	acceptedByName: string;
	acceptedByEmail: string;
	note?: string | null;
};

/** A line item as returned on a quote. */
export type QuickQuoteLine = {
	id: string;
	name: string;
	quantity: string;
	unitPriceCents: number;
	lineTotalCents: number;
	position: number;
	[field: string]: unknown;
};

/** A quote or estimate. The full record is returned; the common fields are typed here. */
export type QuickQuote = {
	id: string;
	workspaceId: string;
	number: string;
	kind: QuickQuoteKind;
	title: string;
	status: QuickQuoteStatus;
	clientId: string;
	clientName: string;
	currency: string;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	validUntil: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
	lines?: QuickQuoteLine[];
	[field: string]: unknown;
};

export type QuickInvoiceStatus = "draft" | "sent" | "paid" | "void";

/** A line item on an invoice. */
export type QuickInvoiceLineInput = {
	description: string;
	quantity: number;
	unitPriceCents: number;
	position?: number;
};

/** Body for creating an invoice over `POST /v1/invoices`. */
export type QuickInvoiceInput = {
	lineItems: QuickInvoiceLineInput[];
	clientId?: string | null;
	currency?: string;
	taxCents?: number;
	notes?: string | null;
	numberPrefix?: string;
};

/** A line item as returned on an invoice. */
export type QuickInvoiceLine = {
	id: string;
	description: string;
	quantity: number;
	unitPriceCents: number;
	position: number;
	[field: string]: unknown;
};

/** An invoice. The full record is returned; the common fields are typed here. */
export type QuickInvoice = {
	id: string;
	workspaceId: string;
	number: string;
	status: QuickInvoiceStatus;
	clientId: string | null;
	clientName: string | null;
	currency: string;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	notes: string | null;
	dueAt: string | null;
	createdAt: string;
	updatedAt: string;
	lineItems?: QuickInvoiceLine[];
	[field: string]: unknown;
};

export type QuickPaymentStatus =
	| "pending"
	| "processing"
	| "succeeded"
	| "failed"
	| "disputed"
	| "refunded";

/** Body for recording a payment over `POST /v1/payments`. */
export type QuickPaymentInput = {
	amountCents: number;
	invoiceId?: string | null;
	clientId?: string | null;
	currency?: string;
	applicationFeeCents?: number;
	status?: "pending" | "processing" | "succeeded" | "failed";
	provider?: string;
	paymentMethod?: string;
	externalPaymentId?: string | null;
	stripePaymentIntentId?: string | null;
	reference?: string | null;
	notes?: string | null;
};

/** Body for refunding a payment over `POST /v1/payments/:id/refund`. */
export type QuickRefundInput = {
	amountCents: number;
	externalRefundId?: string | null;
	reason?: string | null;
};

/** A payment. The full record is returned; the common fields are typed here. */
export type QuickPayment = {
	id: string;
	workspaceId: string;
	invoiceId: string | null;
	clientId: string | null;
	amountCents: number;
	applicationFeeCents: number;
	currency: string;
	status: QuickPaymentStatus;
	provider: string;
	createdAt: string;
	updatedAt: string;
	refunds?: Array<{
		id: string;
		amountCents: number;
		[field: string]: unknown;
	}>;
	[field: string]: unknown;
};

export type QuickOrderStatus =
	| "draft"
	| "placed"
	| "confirmed"
	| "processing"
	| "fulfilled"
	| "cancelled";

/** A purchased line on an order. Snapshots stay immutable once the order is placed. */
export type QuickOrderLineInput = {
	name: string;
	type: "physical" | "digital" | "service" | "rental";
	quantity: number;
	unitPriceCents: number;
	catalogItemId?: string | null;
	catalogItemVariantId?: string | null;
	sku?: string | null;
	metadata?: Record<string, unknown>;
};

/** Body for creating an order over `POST /v1/orders`. */
export type QuickOrderInput = {
	clientId: string;
	lines: QuickOrderLineInput[];
	currency?: string;
	notes?: string | null;
	metadata?: Record<string, unknown>;
	numberPrefix?: string;
};

/** A line item as returned on an order. */
export type QuickOrderLine = {
	id: string;
	name: string;
	type: string;
	quantity: number;
	unitPriceCents: number;
	lineTotalCents: number;
	position: number;
	[field: string]: unknown;
};

/** An order. The full record is returned; the common fields are typed here. */
export type QuickOrder = {
	id: string;
	workspaceId: string;
	number: string;
	status: QuickOrderStatus;
	clientId: string | null;
	clientName: string;
	clientEmail: string | null;
	fulfillmentId: string | null;
	currency: string;
	subtotalCents: number;
	totalCents: number;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
	lineItems?: QuickOrderLine[];
	[field: string]: unknown;
};

/** The fulfillment record opened for a confirmed order. */
export type QuickOrderFulfillmentRef = {
	fulfillmentId: string;
	orderId: string;
};

export type QuickFulfillmentStatus =
	| "pending"
	| "in_progress"
	| "fulfilled"
	| "failed"
	| "cancelled";

export type QuickFulfillmentKind =
	| "physical"
	| "digital"
	| "service"
	| "pickup"
	| "other";

/** Body for opening a delivery over `POST /v1/fulfillments`. */
export type QuickFulfillmentInput = {
	title: string;
	kind?: QuickFulfillmentKind;
	clientId?: string | null;
	invoiceId?: string | null;
	paymentId?: string | null;
	/** Set together with `sourceRecordId` to link the delivery to its originating record. */
	sourceModule?: string | null;
	sourceRecordId?: string | null;
	instructions?: string | null;
	details?: Record<string, unknown>;
	dueAt?: Date | string | null;
};

/** A delivery record. The full record is returned; the common fields are typed here. */
export type QuickFulfillment = {
	id: string;
	workspaceId: string;
	title: string;
	kind: QuickFulfillmentKind;
	status: QuickFulfillmentStatus;
	clientId: string | null;
	clientName: string | null;
	invoiceId: string | null;
	paymentId: string | null;
	sourceModule: string | null;
	sourceRecordId: string | null;
	instructions: string | null;
	details: Record<string, unknown>;
	dueAt: string | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickInventoryStatus = "active" | "archived";

/**
 * A stock movement. `reserve` and `release` move units between available and reserved without
 * changing what is physically on hand; `fulfill_reserved` consumes a reservation.
 */
export type QuickInventoryAdjustmentKind =
	| "receive"
	| "sale"
	| "customer_return"
	| "damage"
	| "correction_in"
	| "correction_out"
	| "reserve"
	| "release"
	| "fulfill_reserved";

/** Body for tracking stock over `POST /v1/inventory`. */
export type QuickInventoryItemInput = {
	catalogItemId: string;
	catalogItemVariantId?: string | null;
	status?: QuickInventoryStatus;
	lowStockThreshold?: number;
	metadata?: Record<string, unknown>;
};

/** Body for recording a movement over `POST /v1/inventory/:id/adjustments`. */
export type QuickInventoryAdjustmentInput = {
	kind: QuickInventoryAdjustmentKind;
	quantity: number;
	note?: string | null;
	/** Links the movement to a record in another module without Inventory owning it. */
	referenceId?: string | null;
	/**
	 * Business-level replay guard, separate from the request's `Idempotency-Key`: it stops the
	 * same real-world event being counted twice even from a different caller.
	 */
	idempotencyKey?: string | null;
	metadata?: Record<string, unknown>;
};

/** A tracked stock record. */
export type QuickInventoryItem = {
	id: string;
	workspaceId: string;
	catalogItemId: string;
	catalogItemVariantId: string | null;
	status: QuickInventoryStatus;
	onHand: number;
	reserved: number;
	lowStockThreshold: number;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

/** A recorded stock movement and the balance it produced. */
export type QuickInventoryAdjustment = {
	id: string;
	workspaceId: string;
	inventoryItemId: string;
	kind: QuickInventoryAdjustmentKind;
	quantity: number;
	onHandDelta: number;
	reservedDelta: number;
	resultingOnHand: number;
	resultingReserved: number;
	note: string | null;
	referenceId: string | null;
	createdAt: string;
	[field: string]: unknown;
};

export type QuickShipmentStatus =
	| "draft"
	| "ready"
	| "shipped"
	| "in_transit"
	| "delivered"
	| "exception"
	| "cancelled";

/** Where a shipment is going. `countryCode` is a two-letter ISO code. */
export type QuickShippingAddress = {
	recipientName: string;
	line1: string;
	city: string;
	countryCode: string;
	company?: string | null;
	line2?: string | null;
	region?: string | null;
	postalCode?: string | null;
	phone?: string | null;
	email?: string | null;
};

/** Body for creating a shipment over `POST /v1/shipments`. */
export type QuickShipmentInput = {
	orderId: string;
	destination: QuickShippingAddress;
	lines: Array<{ orderLineItemId: string; quantity: number }>;
	parcels: Array<{
		weightGrams: number;
		lengthMillimeters?: number | null;
		widthMillimeters?: number | null;
		heightMillimeters?: number | null;
	}>;
	carrier?: string | null;
	serviceLevel?: string | null;
	trackingNumber?: string | null;
	trackingUrl?: string | null;
	metadata?: Record<string, unknown>;
};

/** Carrier tracking details, settable until the shipment is delivered or cancelled. */
export type QuickShipmentTrackingPatch = {
	carrier?: string | null;
	serviceLevel?: string | null;
	trackingNumber?: string | null;
	trackingUrl?: string | null;
};

/** A shipment. The full record is returned; the common fields are typed here. */
export type QuickShipment = {
	id: string;
	workspaceId: string;
	orderId: string;
	fulfillmentId: string;
	status: QuickShipmentStatus;
	destination: QuickShippingAddress;
	carrier: string | null;
	serviceLevel: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	createdAt: string;
	updatedAt: string;
	lines?: Array<{ orderLineItemId: string; quantity: number }>;
	parcels?: Array<{ weightGrams: number; [field: string]: unknown }>;
	[field: string]: unknown;
};

/**
 * A privacy-minimal traffic event a site reports about itself. Visitor and session ids are
 * hashed server-side with a per-workspace salt — send stable opaque ids, never PII. `path`
 * must not include a query string; `referrerHost` is a host only, never a full URL.
 */
export type QuickTrafficEventInput = {
	/** A client-generated unique id; the ingest is idempotent on it. */
	eventId: string;
	siteKey: string;
	visitorId: string;
	sessionId: string;
	path: string;
	referrerHost?: string | null;
	occurredAt: Date | string;
};

export type QuickTrafficEventResult = {
	/** False when this eventId was already recorded (idempotent no-op). */
	accepted: boolean;
	eventId: string;
};
