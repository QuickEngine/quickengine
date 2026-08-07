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

/** Browser-safe checkout key, optionally paired with one customer's session. */
export type QuickConnectCredential = {
	type: "site";
	key: string;
	customerSession?: string;
};

export type QuickSessionCredential = {
	type: "session";
};

/**
 * A session token carried explicitly rather than by cookie.
 *
 * For native shells. A cookie set during a system-browser sign-in cannot reach a
 * Tauri webview — different process, different cookie store — so the token is
 * handed over once and sent as `Authorization: Bearer` from then on. The API
 * already accepts this via Better Auth's `bearer()` plugin; it is the same
 * session, transported differently.
 */
export type QuickBearerCredential = {
	type: "bearer";
	token: string;
};

export type QuickCredential =
	| QuickSecretCredential
	| QuickScopedCredential
	| QuickPublishableCredential
	| QuickConnectCredential
	| QuickSessionCredential
	| QuickBearerCredential;

export type QuickServerCredential =
	| QuickSecretCredential
	| QuickScopedCredential;

export type QuickBrowserCredential =
	| QuickPublishableCredential
	| QuickConnectCredential
	| QuickSessionCredential
	| QuickBearerCredential;

type QuickClientBaseOptions = {
	baseUrl: string;
	fetcher?: typeof fetch;
	apiVersion?: string;
};

export type QuickClientOptions<
	TCredential extends QuickCredential = QuickCredential,
> = QuickClientBaseOptions &
	// `bearer` sits alongside `session` here because it IS a session — the same
	// token, carried explicitly instead of by cookie — so it reaches the same
	// account-scoped endpoints and has the same optional workspace.
	([TCredential] extends [QuickSessionCredential | QuickBearerCredential]
		? {
				credential: TCredential;
				/** Optional for session-scoped account endpoints. */
				workspaceId?: string;
			}
		: {
				credential: TCredential;
				workspaceId: string;
			});

/**
 * What the `QuickClient` constructor accepts.
 *
 * Every `QuickClientOptions<…>` narrows to this, so the class takes any of them
 * without the constructor having to enumerate the combinations — that union grew
 * a member every time a credential was added and started rejecting unions the
 * callers legitimately hold.
 *
 * `workspaceId` is optional here and enforced at runtime instead. The
 * compile-time requirement lives on the factories, which is where callers
 * actually get typed.
 */
export type QuickClientConstructorOptions = QuickClientBaseOptions & {
	credential: QuickCredential;
	workspaceId?: string;
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

export type QuickConnectContext = {
	workspace: { name: string; slug: string };
	modules: string[];
	signedIn: boolean;
};

export type QuickCheckoutItem = {
	catalogItemId: string;
	variantId?: string;
	quantity: number;
};

export type QuickCheckoutAddress = {
	name: string;
	line1: string;
	line2?: string | null;
	city: string;
	region: string;
	postalCode: string;
	countryCode: string;
};

export type QuickCheckoutInput = {
	items: QuickCheckoutItem[];
	email: string;
	name?: string;
	notes?: string;
	discountCode?: string;
	referralCode?: string;
	shippingRateId?: string;
	shippingAddress?: QuickCheckoutAddress;
};

export type QuickCheckoutNextAction =
	| { type: "client_secret"; clientSecret: string }
	| { type: "approval"; approvalUrl: string }
	| { type: "redirect"; redirectUrl: string }
	| { type: "none" };

export type QuickCheckoutResult = {
	order: QuickOrder;
	payment: {
		provider: string;
		externalPaymentId: string;
		nextAction: QuickCheckoutNextAction;
	} | null;
	paymentUnavailableReason?: string;
};

export type QuickCustomerOrderDetail = QuickOrder & {
	lineItems: QuickOrderLine[];
	payment: {
		id: string;
		amountCents: number;
		currency: string;
		provider: string;
		status: QuickPaymentStatus;
		createdAt: string;
		updatedAt: string;
	} | null;
	shipments: Array<{
		id: string;
		status: string;
		carrier: string | null;
		serviceLevel: string | null;
		trackingNumber: string | null;
		trackingUrl: string | null;
		shippedAt: string | null;
		inTransitAt: string | null;
		deliveredAt: string | null;
	}>;
};

export type QuickWishlistItem = {
	catalogItemId: string;
	catalogItemVariantId: string | null;
	name: string;
	priceCents: number | null;
	currency: string;
	status: QuickCatalogStatus;
	addedAt: string;
};

export type QuickPublicReview = {
	id: string;
	rating: number;
	title: string | null;
	body: string | null;
	verifiedPurchase: boolean;
	createdAt: string;
	authorName: string;
};

export type QuickCatalogAvailability = {
	catalogItemId: string;
	catalogItemVariantId: string | null;
	tracked: boolean;
	available: boolean;
	availableQuantity: number | null;
	allowBackorder: boolean;
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

/**
 * The API's failure envelope, as it is actually sent.
 *
 * 🔴 The fields are NESTED under `error`. This type used to declare them at the
 * top level, so `readApiError` read `body.code`, found nothing, and reported
 * `quick_api_error` for every failure — making every stable code documented in
 * the README unreachable and every consumer's `catch` branch dead code.
 *
 * The flat fields are kept as a fallback for any endpoint that has not adopted
 * the envelope.
 */
export type QuickApiErrorBody = {
	error?: {
		code?: string;
		message?: string;
		requestId?: string;
		details?: unknown;
	};
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
	weightGrams: number | null;
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
	weightGramsOverride: number | null;
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
	weightGrams?: number | null;
	metadata?: Record<string, unknown>;
};

/** Body for creating a variant over `POST /v1/catalog/:id/variants`. */
export type QuickCatalogVariantInput = {
	options: QuickVariantOption[];
	status?: QuickCatalogStatus;
	sku?: string | null;
	priceCentsOverride?: number | null;
	weightGramsOverride?: number | null;
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

export type QuickShippingDestination = {
	countryCode: string;
	regionCode?: string | null;
	postalCode?: string | null;
};

export type QuickShippingRateInput = {
	zoneId: string;
	name: string;
	description?: string | null;
	minWeightGrams?: number | null;
	maxWeightGrams?: number | null;
	minOrderCents?: number | null;
	maxOrderCents?: number | null;
	baseCents?: number;
	perKgCents?: number | null;
	freeOverCents?: number | null;
	estimatedDaysMin?: number | null;
	estimatedDaysMax?: number | null;
	active?: boolean;
};

export type QuickShippingRate = Required<
	Pick<QuickShippingRateInput, "zoneId" | "name">
> &
	QuickShippingRateInput & {
		id: string;
		workspaceId: string;
		createdAt: string;
		updatedAt: string;
	};

export type QuickShippingZoneInput = {
	name: string;
	countryCodes?: string[];
	regionCodes?: string[];
	priority?: number;
	active?: boolean;
};

export type QuickShippingZone = QuickShippingZoneInput & {
	id: string;
	workspaceId: string;
	rates: QuickShippingRate[];
	createdAt: string;
	updatedAt: string;
};

export type QuickShippingQuote = {
	zone: { id: string; name: string };
	billableWeightGrams: number;
	options: Array<{
		rateId: string;
		name: string;
		description: string | null;
		amountCents: number;
		free: boolean;
		estimatedDaysMin: number | null;
		estimatedDaysMax: number | null;
	}>;
};

export type QuickProjectStatus =
	| "draft"
	| "active"
	| "on_hold"
	| "completed"
	| "cancelled";

export type QuickMilestoneStatus = "open" | "completed" | "cancelled";

export type QuickTaskStatus =
	| "todo"
	| "in_progress"
	| "blocked"
	| "completed"
	| "cancelled";

export type QuickTaskPriority = "low" | "normal" | "high" | "urgent";

/** Dates on projects, milestones, and tasks are calendar dates (`YYYY-MM-DD`), not timestamps. */
export type QuickProjectInput = {
	name: string;
	clientId?: string | null;
	description?: string | null;
	startDate?: string | null;
	dueDate?: string | null;
	status?: QuickProjectStatus;
	metadata?: Record<string, unknown>;
};

export type QuickProject = {
	id: string;
	workspaceId: string;
	name: string;
	status: QuickProjectStatus;
	clientId: string | null;
	description: string | null;
	startDate: string | null;
	dueDate: string | null;
	/** Set once archived; archived projects are hidden from `list` unless asked for. */
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickMilestoneInput = {
	projectId: string;
	name: string;
	description?: string | null;
	dueDate?: string | null;
	position?: number;
	status?: QuickMilestoneStatus;
	metadata?: Record<string, unknown>;
};

export type QuickMilestone = {
	id: string;
	workspaceId: string;
	projectId: string;
	name: string;
	status: QuickMilestoneStatus;
	dueDate: string | null;
	position: number;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickTaskInput = {
	projectId: string;
	title: string;
	/** A parent task must sit on the same project and milestone as its child. */
	parentTaskId?: string | null;
	milestoneId?: string | null;
	description?: string | null;
	priority?: QuickTaskPriority;
	startDate?: string | null;
	dueDate?: string | null;
	estimatedMinutes?: number | null;
	status?: QuickTaskStatus;
	metadata?: Record<string, unknown>;
};

export type QuickTask = {
	id: string;
	workspaceId: string;
	projectId: string;
	milestoneId: string | null;
	parentTaskId: string | null;
	title: string;
	status: QuickTaskStatus;
	priority: QuickTaskPriority;
	startDate: string | null;
	dueDate: string | null;
	estimatedMinutes: number | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickBookingStatus =
	| "requested"
	| "confirmed"
	| "checked_in"
	| "completed"
	| "cancelled"
	| "no_show";

export type QuickBookingLocationKind = "in_person" | "virtual" | "phone";

/**
 * Body for booking a slot. `scheduleKey` is what a booking competes for — a room, a person, a
 * piece of equipment. Two live bookings can never overlap on the same key.
 */
export type QuickBookingInput = {
	clientId: string;
	title: string;
	startsAt: Date | string;
	endsAt: Date | string;
	/** IANA zone, e.g. "Europe/London". */
	timeZone: string;
	scheduleKey?: string;
	catalogItemId?: string | null;
	catalogItemVariantId?: string | null;
	locationKind?: QuickBookingLocationKind;
	location?: string | null;
	notes?: string | null;
	metadata?: Record<string, unknown>;
};

export type QuickBooking = {
	id: string;
	workspaceId: string;
	clientId: string;
	clientName: string | null;
	title: string;
	status: QuickBookingStatus;
	scheduleKey: string;
	startsAt: string;
	endsAt: string;
	timeZone: string;
	locationKind: QuickBookingLocationKind;
	location: string | null;
	cancellationReason: string | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickTimeEntryStatus =
	| "running"
	| "draft"
	| "approved"
	| "invoiced"
	| "void";

/** Shared by manual entries and timers. `trackerKey` is what a timer is exclusive on. */
type QuickTimeEntryCommon = {
	projectId: string;
	taskId?: string | null;
	trackerKey?: string;
	description?: string | null;
	billable?: boolean;
	/** Only allowed when billable. */
	hourlyRateCents?: number | null;
	currency?: string;
	metadata?: Record<string, unknown>;
};

/** Body for logging time after the fact over `POST /v1/time-entries`. */
export type QuickManualTimeEntryInput = QuickTimeEntryCommon & {
	/** Calendar date, `YYYY-MM-DD`. */
	workDate: string;
	durationSeconds: number;
};

/** Body for starting a timer over `POST /v1/timers`. A timer may not start in the future. */
export type QuickTimerStartInput = QuickTimeEntryCommon & {
	startedAt: Date | string;
	timeZone: string;
};

export type QuickTimeEntry = {
	id: string;
	workspaceId: string;
	projectId: string;
	taskId: string | null;
	trackerKey: string;
	status: QuickTimeEntryStatus;
	source: "manual" | "timer";
	description: string | null;
	billable: boolean;
	hourlyRateCents: number | null;
	currency: string;
	durationSeconds: number;
	startedAt: string | null;
	endedAt: string | null;
	invoiceId: string | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

/** Result of attaching or detaching time on an invoice. */
export type QuickTimeInvoiceResult = {
	entryIds: string[];
	invoiceId: string;
};

export type QuickContractStatus =
	| "draft"
	| "sent"
	| "partially_signed"
	| "completed"
	| "declined"
	| "expired"
	| "voided"
	| "superseded";

export type QuickContractSignerStatus = "pending" | "signed" | "declined";

/** A signer as returned by the API. Token material is never included. */
export type QuickContractSigner = {
	id: string;
	contractId: string;
	name: string;
	email: string;
	role: string | null;
	position: number;
	status: QuickContractSignerStatus;
	viewedAt: string | null;
	signedAt: string | null;
	declinedAt: string | null;
	[field: string]: unknown;
};

export type QuickContractInput = {
	title: string;
	clientId?: string | null;
	fileVersionId?: string | null;
	signers?: Array<{
		name: string;
		email: string;
		role?: string | null;
		position?: number;
	}>;
	expiresAt?: Date | string | null;
	metadata?: Record<string, unknown>;
};

export type QuickContract = {
	id: string;
	workspaceId: string;
	number: string;
	title: string;
	status: QuickContractStatus;
	clientId: string | null;
	clientName: string;
	seriesId: string;
	supersedesId: string | null;
	sentAt: string | null;
	completedAt: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	signers?: QuickContractSigner[];
	[field: string]: unknown;
};

/**
 * Result of sending a contract. Deliberately carries no signing tokens — the links are delivered
 * out of band, never returned, logged, or stored for replay.
 */
export type QuickContractSendResult = QuickContract & {
	invitations: Array<{
		signerId: string;
		name: string;
		email: string;
		expiresAt: string;
	}>;
};

export type QuickDocumentStatus =
	| "active"
	| "archived"
	| "trashed"
	| "deleting";

export type QuickFileVersionStatus =
	| "pending"
	| "available"
	| "failed"
	| "quarantined";

export type QuickFileFolderInput = {
	name: string;
	parentId?: string | null;
	metadata?: Record<string, unknown>;
};

export type QuickFileFolder = {
	id: string;
	workspaceId: string;
	name: string;
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
	[field: string]: unknown;
};

export type QuickDocumentInput = {
	title: string;
	folderId?: string | null;
	description?: string | null;
	tags?: string[];
	metadata?: Record<string, unknown>;
};

/** A stored version. Internal storage addressing is never exposed. */
export type QuickFileVersion = {
	id: string;
	documentId: string;
	versionNumber: number;
	status: QuickFileVersionStatus;
	originalName: string;
	contentType: string;
	sizeBytes: number;
	checksumSha256: string;
	availableAt: string | null;
	createdAt: string;
	[field: string]: unknown;
};

export type QuickDocument = {
	id: string;
	workspaceId: string;
	title: string;
	status: QuickDocumentStatus;
	folderId: string | null;
	description: string | null;
	currentVersionNumber: number | null;
	createdAt: string;
	updatedAt: string;
	versions?: QuickFileVersion[];
	[field: string]: unknown;
};

export type QuickFileAttachment = {
	id: string;
	workspaceId: string;
	documentId: string;
	targetModule: string;
	targetId: string;
	createdAt: string;
	[field: string]: unknown;
};

/** A report section. `available: false` means the module is off, not that the value is zero. */
export type QuickReportSection<T> =
	| { available: true; data: T }
	| { available: false; data: null };

export type QuickReportRange = {
	from?: Date | string;
	to?: Date | string;
	/** IANA zone the range is bucketed in. Defaults to UTC. */
	timeZone?: string;
	granularity?: "day" | "week" | "month";
};

/** One bucket of a time series. `amountCents` is per-currency; currencies are never summed. */
export type QuickSeriesPoint = {
	bucket: string;
	currency?: string;
	amountCents?: number;
	count?: number;
	[field: string]: unknown;
};

export type QuickRevenueSeries = {
	collected: QuickSeriesPoint[];
	refunded: QuickSeriesPoint[];
};

export type QuickTrafficSummary = {
	views: number;
	visitors: number;
	sessions: number;
	[field: string]: unknown;
};

/**
 * Cross-module snapshot. Every section reports its own availability, so a caller can tell
 * "this workspace has no invoices" apart from "invoicing isn't switched on".
 */
export type QuickWorkspaceReport = {
	workspace: { id: string; name: string };
	range: { from: string; to: string; timeZone: string; granularity: string };
	clients: QuickReportSection<Record<string, unknown>>;
	invoices: QuickReportSection<Record<string, unknown>>;
	payments: QuickReportSection<Record<string, unknown>>;
	revenueSeries: QuickReportSection<QuickRevenueSeries>;
	orders: QuickReportSection<Record<string, unknown>>;
	fulfillment: QuickReportSection<Record<string, unknown>>;
	projects: QuickReportSection<Record<string, unknown>>;
	bookings: QuickReportSection<Record<string, unknown>>;
	contracts: QuickReportSection<Record<string, unknown>>;
	inventory: QuickReportSection<Record<string, unknown>>;
	traffic: QuickReportSection<{
		summary: QuickTrafficSummary;
		series: QuickSeriesPoint[];
	}>;
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

/**
 * A registered destination for this workspace's events.
 *
 * The signing secret is deliberately absent: it is returned once, by `create`,
 * and there is no route that reads it back.
 */
export type QuickWebhookEndpoint = {
	id: string;
	url: string;
	description: string | null;
	/** Empty means every event. */
	eventTypes: string[];
	enabled: boolean;
	/** Set when QuickEngine disabled the endpoint after repeated failures. */
	disabledReason: string | null;
	createdAt: string;
	updatedAt: string;
};

/** The endpoint plus its signing secret — the only time the secret is returned. */
export type QuickCreatedWebhookEndpoint = QuickWebhookEndpoint & {
	secret: string;
};

export type QuickWebhookEndpointInput = {
	/** Must be https, except localhost while developing. */
	url: string;
	description?: string | null;
	/** Omit or leave empty to receive every event. */
	eventTypes?: string[];
};

export type QuickWebhookEndpointPatch = Partial<QuickWebhookEndpointInput> & {
	enabled?: boolean;
};

export type QuickWebhookDeliveryStatus =
	| "pending"
	| "succeeded"
	| "failed"
	| "exhausted";

/** One event's delivery to one endpoint, with its attempt history. */
export type QuickWebhookDelivery = {
	id: string;
	endpointId: string;
	/** The event id your receiver should dedupe on. */
	eventId: string;
	eventName: string;
	status: QuickWebhookDeliveryStatus;
	attempts: number;
	responseStatus: number | null;
	/** Truncated response body from your endpoint, for debugging. */
	responseBody: string | null;
	/** Transport failure (timeout, DNS, TLS) where no HTTP status was received. */
	error: string | null;
	deliveredAt: string | null;
	createdAt: string;
};

/** One recorded domain event in a workspace's history. */
export type QuickActivityEvent = {
	/** Monotonic stream position — the value to page from. */
	seq: number;
	/** Stable event id; the same value a webhook delivery carries. */
	id: string;
	workspaceId: string;
	/** Canonical `<entity>.<verb>`, e.g. `invoice.paid`. */
	name: string;
	/** The affected record. Text, because the record may since have been deleted. */
	recordId: string;
	/** User or API-key id; null for system-originated events. */
	actorId: string | null;
	occurredAt: string;
};

export type QuickActivityPage = {
	events: QuickActivityEvent[];
	/** Pass to `activity.since()` to continue from here. */
	cursor: number;
};

/** A node in the browsable tree. `itemCount` counts direct members only. */
export type QuickCategoryNode = {
	id: string;
	kind: "category" | "collection";
	name: string;
	slug: string;
	description: string | null;
	parentId: string | null;
	sortOrder: number;
	imageUrl: string | null;
	featured: boolean;
	visible: boolean;
	itemCount: number;
	children: QuickCategoryNode[];
};

export type QuickCategoryInput = {
	kind?: "category" | "collection";
	name: string;
	/** Lowercase, hyphenated. It is what appears in the storefront's URL. */
	slug: string;
	description?: string | null;
	parentId?: string | null;
	sortOrder?: number;
	imageUrl?: string | null;
	featured?: boolean;
	/** Hidden categories stay out of a storefront's navigation. */
	visible?: boolean;
};
