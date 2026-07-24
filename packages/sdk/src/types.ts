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
