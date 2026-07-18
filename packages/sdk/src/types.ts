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

export type QuickApiErrorBody = {
	code?: string;
	message?: string;
	details?: unknown;
};

/**
 * A published catalog item as returned by `GET /v1/catalog`. This is the public
 * storefront shape — internal columns (status, workspace, timestamps) are not exposed.
 */
export type QuickCatalogItem = {
	id: string;
	name: string;
	description: string | null;
	type: "physical" | "digital" | "service" | "package" | "rental";
	sku: string | null;
	pricingModel: "fixed" | "starting_at" | "hourly" | "custom_quote" | "free";
	priceCents: number | null;
	currency: string;
	unitLabel: string | null;
};

/** An active variant of a catalog item, as returned by `GET /v1/catalog/:id`. */
export type QuickCatalogVariant = {
	id: string;
	options: { name: string; value: string }[];
	sku: string | null;
	priceCentsOverride: number | null;
};

/** A single catalog item with its active variants — the storefront product-detail shape. */
export type QuickCatalogItemDetail = QuickCatalogItem & {
	variants: QuickCatalogVariant[];
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
