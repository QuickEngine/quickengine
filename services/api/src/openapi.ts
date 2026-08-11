import {
	apiErrorSchema,
	errorEnvelopeSchema,
	successEnvelopeSchema,
	toOpenApiSchema,
} from "@quickengine/api-contracts";
import { z } from "zod";
import type { ApiConfig } from "./config";
import { augmentOpenApiDocument } from "./openapi-augment";

function declaredDocument(config: ApiConfig) {
	const readinessEnvelope = successEnvelopeSchema(
		z.object({
			checks: z.array(
				z.object({
					name: z.string(),
					status: z.enum(["error", "ok"]),
				}),
			),
			service: z.string(),
			status: z.enum(["degraded", "not_ready", "ready"]),
		}),
	);
	return {
		openapi: "3.1.0",
		info: {
			title: "QuickEngine API",
			version: config.version,
			description: "The canonical API for QuickEngine and QuickDash.",
		},
		servers: [{ url: config.baseUrl }],
		components: {
			securitySchemes: {
				bearerApiKey: { type: "http", scheme: "bearer" },
				workspaceSession: {
					type: "apiKey",
					in: "cookie",
					name: "quickengine.session_token",
				},
			},
			schemas: {
				ApiError: toOpenApiSchema(apiErrorSchema),
				ErrorEnvelope: toOpenApiSchema(errorEnvelopeSchema),
				HealthEnvelope: toOpenApiSchema(
					successEnvelopeSchema(
						z.object({
							service: z.string(),
							status: z.literal("ok"),
							version: z.string(),
						}),
					),
				),
				ReadinessEnvelope: toOpenApiSchema(readinessEnvelope),
			},
		},
		paths: {
			"/v1/clients": {
				get: {
					operationId: "listClients",
					summary: "List client records",
					responses: { "200": { description: "A cursor page of clients." } },
				},
				post: {
					operationId: "createClient",
					summary: "Create a client record",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Client created." },
						"409": {
							description: "Idempotency conflict or request in progress.",
						},
					},
				},
			},
			"/v1/clients/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getClient",
					responses: {
						"200": { description: "The client." },
						"404": { description: "Client not found." },
					},
				},
				patch: {
					operationId: "updateClient",
					responses: { "200": { description: "Client updated." } },
				},
				delete: {
					operationId: "deleteClient",
					responses: { "200": { description: "Client deleted." } },
				},
			},
			"/v1/clients/{id}/addresses": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "listClientAddresses",
					responses: { "200": { description: "Client addresses." } },
				},
				post: {
					operationId: "createClientAddress",
					responses: { "201": { description: "Address created." } },
				},
			},
			"/v1/addresses/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getClientAddress",
					responses: { "200": { description: "The address." } },
				},
				patch: {
					operationId: "updateClientAddress",
					responses: { "200": { description: "Address updated." } },
				},
				delete: {
					operationId: "deleteClientAddress",
					responses: { "200": { description: "Address deleted." } },
				},
			},
			"/v1/catalog": {
				get: {
					operationId: "listCatalogItems",
					summary: "List catalog items",
					responses: {
						"200": { description: "A cursor page of catalog items." },
					},
				},
				post: {
					operationId: "createCatalogItem",
					summary: "Create a catalog item",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Catalog item created." },
						"409": { description: "Idempotency or SKU conflict." },
					},
				},
			},
			"/v1/catalog/availability": {
				post: {
					operationId: "getCatalogAvailability",
					summary: "Get browser-safe stock availability",
					description:
						"Returns authoritative available quantities for up to 100 catalog items. Untracked items remain purchasable; tracked archived or exhausted items do not, unless the workspace explicitly allows backorders.",
					responses: {
						"200": { description: "Availability by item and variant." },
						"400": { description: "Invalid catalog item IDs." },
					},
				},
			},
			"/v1/catalog/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getCatalogItem",
					responses: {
						"200": { description: "The catalog item." },
						"404": { description: "Catalog item not found." },
					},
				},
				patch: {
					operationId: "updateCatalogItem",
					responses: { "200": { description: "Catalog item updated." } },
				},
				delete: {
					operationId: "deleteCatalogItem",
					responses: {
						"200": { description: "Catalog item deleted." },
						"409": { description: "The item must be archived first." },
					},
				},
			},
			"/v1/catalog/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setCatalogItemStatus",
					summary: "Move a catalog item between draft, active, and archived",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/catalog/{id}/variants": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "listCatalogItemVariants",
					responses: { "200": { description: "The item's variants." } },
				},
				post: {
					operationId: "createProductVariant",
					responses: { "201": { description: "Variant created." } },
				},
			},
			"/v1/variants/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getProductVariant",
					responses: {
						"200": { description: "The variant." },
						"404": { description: "Variant not found." },
					},
				},
				patch: {
					operationId: "updateProductVariant",
					responses: { "200": { description: "Variant updated." } },
				},
				delete: {
					operationId: "deleteProductVariant",
					responses: {
						"200": { description: "Variant deleted." },
						"409": { description: "The variant must be archived first." },
					},
				},
			},
			"/v1/variants/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setProductVariantStatus",
					summary: "Move a variant between draft, active, and archived",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal transition or inactive parent." },
					},
				},
			},
			"/v1/quotes": {
				get: {
					operationId: "listQuotes",
					summary: "List quotes and estimates",
					responses: { "200": { description: "A cursor page of quotes." } },
				},
				post: {
					operationId: "createQuote",
					summary: "Create a quote or estimate",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Quote created." },
						"409": {
							description: "Idempotency conflict or invalid reference.",
						},
					},
				},
			},
			"/v1/quotes/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getQuote",
					responses: {
						"200": { description: "The quote with its line items." },
						"404": { description: "Quote not found." },
					},
				},
				patch: {
					operationId: "updateDraftQuote",
					responses: {
						"200": { description: "Draft quote updated." },
						"409": { description: "Only a draft quote can be edited." },
					},
				},
				delete: {
					operationId: "deleteDraftQuote",
					responses: { "200": { description: "Draft quote deleted." } },
				},
			},
			"/v1/quotes/{id}/send": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "sendQuote",
					responses: { "200": { description: "Quote sent." } },
				},
			},
			"/v1/quotes/{id}/accept": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "acceptQuote",
					responses: { "200": { description: "Quote accepted." } },
				},
			},
			"/v1/quotes/{id}/decline": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "declineQuote",
					responses: { "200": { description: "Quote declined." } },
				},
			},
			"/v1/quotes/{id}/convert": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "convertQuote",
					summary: "Convert an accepted quote into an invoice or order",
					responses: {
						"201": { description: "Quote converted." },
						"409": { description: "The quote is not in a convertible state." },
					},
				},
			},
			"/v1/invoices": {
				get: {
					operationId: "listInvoices",
					summary: "List invoices",
					responses: { "200": { description: "A cursor page of invoices." } },
				},
				post: {
					operationId: "createInvoice",
					summary: "Create an invoice",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Invoice created." },
						"409": {
							description: "Idempotency conflict or invalid reference.",
						},
					},
				},
			},
			"/v1/invoices/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getInvoice",
					responses: {
						"200": { description: "The invoice with its line items." },
						"404": { description: "Invoice not found." },
					},
				},
				patch: {
					operationId: "updateDraftInvoice",
					responses: {
						"200": { description: "Draft invoice updated." },
						"409": { description: "Only a draft invoice can be edited." },
					},
				},
				delete: {
					operationId: "deleteInvoice",
					responses: { "200": { description: "Draft invoice deleted." } },
				},
			},
			"/v1/invoices/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setInvoiceStatus",
					summary: "Move an invoice between draft, sent, paid, and void",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/payments": {
				get: {
					operationId: "listPayments",
					summary: "List payments",
					responses: { "200": { description: "A cursor page of payments." } },
				},
				post: {
					operationId: "recordPayment",
					summary: "Record a payment",
					description:
						"Records money that has already moved. Pass `orderId` when a storefront ran its own payment provider — the order is created through /v1/checkout, the site takes the payment, and this attaches the two. Pass `invoiceId` for an invoice payment. Both are verified against the workspace before use.",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Payment recorded." },
						"409": { description: "Idempotency conflict or invalid amount." },
					},
				},
			},
			"/v1/payments/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getPayment",
					responses: {
						"200": { description: "The payment with its refunds." },
						"404": { description: "Payment not found." },
					},
				},
			},
			"/v1/payments/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setPaymentStatus",
					summary: "Move a payment between its lifecycle statuses",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/payments/{id}/refund": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "refundPayment",
					summary: "Refund all or part of a succeeded payment",
					responses: {
						"201": { description: "Refund recorded." },
						"409": {
							description: "Payment not refundable or amount too high.",
						},
					},
				},
			},
			// ── Connect: a business's OWN payment account ────────────────────────
			// Distinct from QuickEngine's billing. These let a workspace get paid by
			// ITS customers; billing is how QuickEngine charges the workspace.
			"/v1/payments/connect": {
				get: {
					operationId: "getPaymentConnectAccount",
					summary: "A workspace payment account",
					description:
						"Our stored view, with no call to the provider. Omit `provider` for the checkout default or name one connected provider. Answers a not-connected shape rather than 404.",
					parameters: [
						{
							in: "query",
							name: "provider",
							schema: { type: "string", enum: ["stripe", "paypal"] },
						},
					],
					responses: {
						"200": {
							description:
								"Provider, whether it is connected, and whether charges and payouts are enabled.",
						},
					},
				},
			},
			"/v1/payments/connect/refresh": {
				post: {
					operationId: "refreshPaymentConnectAccount",
					summary: "Re-read the account from the provider",
					description:
						"Onboarding finishes asynchronously, so the stored state goes stale immediately. Omit `provider` to refresh the default or name a connected provider. Makes one outbound call and is rate limited as a write.",
					parameters: [
						{
							in: "query",
							name: "provider",
							schema: { type: "string", enum: ["stripe", "paypal"] },
						},
					],
					responses: {
						"200": { description: "The refreshed account state." },
					},
				},
			},
			"/v1/payments/connect/default": {
				put: {
					operationId: "setDefaultPaymentProvider",
					summary: "Choose which connected provider checkout uses",
					description:
						"Changes the provider used for new checkout attempts. Existing payments retain their own provider and merchant account for settlement and refunds.",
					responses: {
						"200": { description: "The selected connected account." },
						"404": { description: "That provider is not connected." },
					},
				},
			},
			"/v1/payments/connect/onboard": {
				post: {
					operationId: "startPaymentOnboarding",
					summary: "Begin connecting the business's payment account",
					description:
						"Returns a provider-hosted URL to send the operator to. Active providers cannot be connected twice; pending onboarding may be restarted when a hosted link expires. `returnUrl` and `refreshUrl` must be QuickDash origins — an attacker-chosen redirect here would be a phishing page reached from a payment provider's domain.",
					responses: {
						"200": { description: "An onboarding URL and the account state." },
						"400": {
							description:
								"Missing or non-QuickDash redirect URLs, or a provider with no integration.",
						},
					},
				},
			},
			// ── Catalog browsing: categories and collections ─────────────────────
			// One shape for both. A category is where a thing belongs; a collection
			// is a curated grouping. They differ in meaning and nothing else.
			"/v1/categories": {
				get: {
					operationId: "listCategories",
					summary: "The browsable category tree",
					description:
						"Readable with a storefront credential — navigation is public by definition. Hidden categories are excluded unless `includeHidden=true`, which defaults that way deliberately: the common caller is a storefront, and defaulting to showing everything would put a shop's unpublished seasonal collection on its live site the first time somebody forgot a parameter. Item counts come from one grouped query rather than one per category.",
					responses: {
						"200": { description: "Nested categories with item counts." },
					},
				},
				post: {
					operationId: "createCategory",
					summary: "Create a category or collection",
					responses: {
						"201": { description: "The created category." },
						"400": {
							description:
								"Invalid input, a slug already used in this workspace, or a parent that would create a cycle.",
						},
					},
				},
			},
			"/v1/categories/{slug}/items": {
				parameters: [
					{
						in: "path",
						name: "slug",
						required: true,
						schema: { type: "string" },
					},
				],
				get: {
					operationId: "listCategoryItems",
					summary: "The catalog item ids in a category",
					responses: {
						"200": { description: "Item ids in merchandising order." },
					},
				},
			},
			"/v1/categories/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				patch: {
					operationId: "updateCategory",
					summary: "Rename, move or reorder a category",
					description:
						"Moving a category under one of its own descendants is refused — a cycle makes a tree walk that never terminates, and the first symptom would be a storefront navigation render that hangs.",
					responses: {
						"200": { description: "The updated category." },
						"400": {
							description: "A taken slug, or a parent that would cycle.",
						},
						"404": { description: "No such category." },
					},
				},
				delete: {
					operationId: "deleteCategory",
					summary: "Delete a category, lifting its children",
					description:
						"Children are re-parented to the deleted category's own parent rather than orphaned to the top level, so reorganising a shop does not flatten its nesting.",
					responses: {
						"200": { description: "Deleted." },
						"404": { description: "No such category." },
					},
				},
			},
			"/v1/catalog/{id}/categories": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				put: {
					operationId: "setItemCategories",
					summary: "Replace which categories a catalog item belongs to",
					description:
						"Many-to-many: an item belongs in Rings AND in Under 500 AND in Summer picks. Every category is verified against the workspace before linking, so an item cannot be filed under another shop's collection.",
					responses: {
						"200": { description: "How many categories the item now has." },
						"400": { description: "Invalid ids." },
						"404": { description: "No such item or category." },
					},
				},
			},
			// ── Content: the words on a workspace's own website ─────────────────
			// Named slots, not pages. A developer declares which parts of a site are
			// editable; the operator fills them. Nothing here models layout.
			"/v1/content": {
				get: {
					operationId: "listPublishedContent",
					summary: "Every published content slot, as a map",
					description:
						"Readable with a storefront credential, because this is copy meant for a public web page. Keyed by slot name so a template can index it directly. Unpublished drafts are excluded in SQL — a draft is something the business has deliberately not said yet.",
					responses: {
						"200": { description: "A map of slot key to value." },
					},
				},
			},
			"/v1/content/{key}": {
				parameters: [
					{
						in: "path",
						name: "key",
						required: true,
						schema: { type: "string" },
					},
				],
				get: {
					operationId: "getPublishedContent",
					summary: "One published content slot",
					responses: {
						"200": { description: "The slot's value." },
						"404": {
							description:
								"No slot at that key, or it is not published. Answered identically so a public caller cannot detect an unpublished draft.",
						},
					},
				},
			},
			"/v1/content/manage/all": {
				get: {
					operationId: "listAllContent",
					summary: "Every slot including drafts, for the editing form",
					description:
						"Operator only. The single route that exposes unpublished content, kept separate from the public read rather than sharing a handler with a flag.",
					responses: {
						"200": { description: "Slots with labels, groups and drafts." },
					},
				},
			},
			"/v1/content/manage/manifest": {
				post: {
					operationId: "registerContentManifest",
					summary: "Declare a site's editable slots in one call",
					description:
						"The agency path: a developer registers every editable slot when building a client's site, so the operator's form arrives populated with labels and groups. Existing values survive, because a redeploy must never wipe the words their owner wrote.",
					responses: {
						"200": { description: "How many slots were registered." },
						"400": { description: "The manifest could not be read." },
					},
				},
			},
			"/v1/content/manage/publish": {
				post: {
					operationId: "setContentPublished",
					summary: "Publish or unpublish slots without changing the words",
					responses: {
						"200": { description: "How many slots changed." },
						"400": { description: "Missing keys or published flag." },
					},
				},
			},
			"/v1/content/manage/{key}": {
				parameters: [
					{
						in: "path",
						name: "key",
						required: true,
						schema: { type: "string" },
					},
				],
				put: {
					operationId: "upsertContentEntry",
					summary: "Create or update one content slot",
					description:
						"The path key is authoritative; a body naming a different key is ignored. Fields left out are left alone, so saving a label does not blank the copy.",
					responses: {
						"200": { description: "The stored slot." },
						"400": { description: "The entry could not be read." },
					},
				},
				delete: {
					operationId: "deleteContentEntry",
					summary: "Remove a content slot entirely",
					description:
						"Deletes the definition, not just the value. A site that stops using a slot should not leave a field in the operator's form that changes nothing.",
					responses: {
						"200": { description: "Deleted." },
						"404": { description: "No slot at that key." },
					},
				},
			},
			// ── Reviews and the moderation queue ─────────────────────────────────
			// Nothing a customer writes is public until an operator publishes it.
			"/v1/catalog/{id}/reviews": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "listPublishedReviews",
					summary: "Published reviews for a product",
					description:
						"Readable with a storefront credential. Pending and rejected reviews are excluded in SQL rather than filtered after — a moderation queue that leaks its contents is not a queue. Reviewers are credited as a first name and last initial, because a review page showing a full email publishes a customer's address to the internet.",
					responses: {
						"200": { description: "Published reviews, newest first." },
					},
				},
			},
			"/v1/reviews/summary": {
				post: {
					operationId: "reviewSummary",
					summary: "Rating averages for a set of products",
					description:
						"Batched, because a shop page showing 24 products would otherwise make 24 requests from a browser to render 24 star ratings. Averages PUBLISHED reviews only.",
					responses: {
						"200": { description: "Average and count per catalog item." },
						"400": { description: "Send the catalog item ids." },
					},
				},
			},
			"/v1/reviews/moderation": {
				get: {
					operationId: "listReviewsForModeration",
					summary: "The moderation queue",
					description:
						"Operator only, and the only place an unpublished review is visible. Oldest first: a queue worked newest-first leaves the oldest complaint sitting longest.",
					responses: { "200": { description: "Reviews awaiting a decision." } },
				},
			},
			"/v1/reviews/{id}/moderate": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "moderateReview",
					summary: "Publish or reject a review",
					description:
						"Records who decided and when. A shop curating its own reviews should leave a trail — for its own disputes as much as anyone else's. The rejection note is internal and never shown to the customer.",
					responses: {
						"200": { description: "The new status." },
						"404": { description: "No such review." },
					},
				},
			},
			"/v1/customer/reviews": {
				get: {
					operationId: "listOwnReviews",
					summary: "This customer's own reviews, including pending ones",
					description:
						"Shows status, so somebody who cannot find their review knows it is awaiting approval rather than assuming it was thrown away.",
					responses: { "200": { description: "Their reviews." } },
				},
				post: {
					operationId: "createReview",
					summary: "Leave a review",
					description:
						"Always created pending — there is no path that publishes on write. `verifiedPurchase` is derived from whether the customer has a non-cancelled order containing the item, and stored, so a later refund cannot silently strip a badge the review earned.",
					responses: {
						"201": { description: "The review, awaiting moderation." },
						"404": {
							description: "No client record, or the item is unavailable.",
						},
						"409": { description: "Already reviewed this item." },
					},
				},
			},
			// ── Discounts ────────────────────────────────────────────────────────
			"/v1/discounts/preview": {
				post: {
					operationId: "previewDiscount",
					summary: "What a code would take off this basket",
					description:
						"Takes the CART, never a subtotal. A subtotal from the browser lets anyone claim a large order to clear a minimum-spend threshold, or compute a percentage against a number they invented — so the server prices the same items it would price at checkout, and the preview cannot disagree with the real thing. Answers 200 whether or not the code is usable: an expired code is a normal answer to a normal question.",
					responses: {
						"200": {
							description:
								"Either the discount and the resulting total, or why the code cannot be used.",
						},
						"400": { description: "Missing code, or an unavailable item." },
					},
				},
			},
			"/v1/discounts": {
				get: {
					operationId: "listDiscounts",
					summary: "Every discount code in the workspace",
					responses: { "200": { description: "Codes with their usage." } },
				},
				post: {
					operationId: "createDiscount",
					summary: "Create a discount code",
					description:
						"Percentages are basis points (1000 is 10%); fixed amounts are minor units. Both are integers — a float here is how a 10% code takes 4.999999 off a 50 order.",
					responses: {
						"201": { description: "The created code." },
						"400": {
							description:
								"Invalid input, or a window that ends before it starts.",
						},
						"409": {
							description: "That code already exists in this workspace.",
						},
					},
				},
			},
			"/v1/discounts/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				patch: {
					operationId: "updateDiscount",
					summary: "Change a discount code",
					responses: {
						"200": { description: "The updated code." },
						"404": { description: "No such discount." },
						"409": { description: "That code already exists." },
					},
				},
				delete: {
					operationId: "deleteDiscount",
					summary: "Delete a discount code",
					description:
						"Removes its redemption history with it. A code that has been used should be deactivated instead, which keeps the record of what it cost.",
					responses: {
						"200": { description: "Deleted." },
						"404": { description: "No such discount." },
					},
				},
			},
			// ── Contact: the marketing site's form ───────────────────────────────
			"/v1/contact": {
				post: {
					operationId: "submitContact",
					summary: "Send a message from the marketing contact form",
					description:
						"Public and unauthenticated, like checkout, and the only other write that is. Delivers the message to QuickEngine by email and stores nothing: there is no record, no queue and no admin screen, so a stranger's details never enter a database. Carries a hidden honeypot field which, when filled, is answered as success and dropped. Subject to the standard rate limit.",
					responses: {
						"202": {
							description:
								"Accepted for delivery. Also returned when the honeypot rejected the submission, deliberately indistinguishable from success.",
						},
						"400": {
							description:
								"The message failed validation. No field detail is returned.",
						},
						"502": { description: "The mail provider could not be reached." },
					},
				},
			},
			// ── Checkout: the merchant's own website selling ─────────────────────
			"/v1/checkout": {
				post: {
					operationId: "createCheckout",
					summary: "Place and pay for an order from a merchant storefront",
					description:
						"The only write reachable with a credential that ships in page source. The caller names catalog items and quantities; the server resolves every price from its own catalog, applies the workspace's tax rate, creates the order, and opens a charge on the merchant's connected account. No price, tax, currency or client id is accepted from the request. Send an idempotency key so a double-tapped buy button cannot become two orders. A workspace with no connected payment account still records the order and answers with a reason instead of a payment.",
					responses: {
						"201": {
							description:
								"The order and a provider-neutral next action when the business can be paid online. The action is a client secret, approval token, hosted redirect, or no further browser work.",
						},
						"400": {
							description:
								"An item is unavailable, not directly purchasable, or the basket mixes currencies.",
						},
						"403": { description: "The key lacks checkout access." },
					},
				},
			},
			"/v1/checkout/{externalPaymentId}/capture": {
				parameters: [
					{
						in: "path",
						name: "externalPaymentId",
						required: true,
						schema: { type: "string", maxLength: 255 },
					},
				],
				post: {
					operationId: "captureCheckoutPayment",
					summary: "Capture a browser-approved provider payment",
					description:
						"Completes a payment only after the buyer approved it in the provider UI. The stored workspace payment chooses the provider and merchant account; the browser cannot redirect capture to another account.",
					responses: {
						"200": {
							description: "The provider capture and settlement outcome.",
						},
						"404": { description: "No matching capturable payment." },
					},
				},
			},
			"/v1/orders": {
				get: {
					operationId: "listOrders",
					summary: "List orders",
					responses: { "200": { description: "A cursor page of orders." } },
				},
				post: {
					operationId: "createOrder",
					summary: "Create an order",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Order created." },
						"409": { description: "Idempotency conflict." },
						"400": {
							description: "A referenced client or catalog item is invalid.",
						},
					},
				},
			},
			"/v1/orders/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getOrder",
					responses: {
						"200": { description: "The order with its line items." },
						"404": { description: "Order not found." },
					},
				},
				patch: {
					operationId: "updateDraftOrder",
					responses: {
						"200": { description: "Draft order updated." },
						"409": { description: "Only a draft order can be edited." },
					},
				},
				delete: {
					operationId: "deleteOrder",
					responses: { "200": { description: "Draft order deleted." } },
				},
			},
			"/v1/orders/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setOrderStatus",
					summary:
						"Move an order between draft, placed, confirmed, processing, fulfilled, and cancelled",
					responses: {
						"200": { description: "Status changed." },
						"409": {
							description:
								"Illegal or redundant transition, or fulfillment is incomplete.",
						},
					},
				},
			},
			"/v1/orders/{id}/fulfillment": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "ensureOrderFulfillment",
					summary: "Open the fulfillment record for a confirmed order",
					responses: {
						"200": { description: "The order's fulfillment identifier." },
						"409": {
							description: "The order is not ready for fulfillment.",
						},
					},
				},
			},
			"/v1/fulfillments": {
				get: {
					operationId: "listFulfillments",
					summary: "List deliveries",
					responses: {
						"200": { description: "A cursor page of deliveries." },
					},
				},
				post: {
					operationId: "createFulfillment",
					summary: "Open a delivery record",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Delivery created." },
						"409": {
							description:
								"Idempotency conflict, or that source record already has a delivery.",
						},
					},
				},
			},
			"/v1/fulfillments/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getFulfillment",
					responses: {
						"200": { description: "The delivery." },
						"404": { description: "Delivery not found." },
					},
				},
				delete: {
					operationId: "deleteFulfillment",
					responses: {
						"200": { description: "Pending delivery deleted." },
						"409": { description: "Only a pending delivery can be deleted." },
					},
				},
			},
			"/v1/fulfillments/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setFulfillmentStatus",
					summary:
						"Move a delivery between pending, in progress, fulfilled, failed, and cancelled",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/inventory": {
				get: {
					operationId: "listInventoryItems",
					summary: "List tracked stock records",
					responses: {
						"200": { description: "A cursor page of stock records." },
					},
				},
				post: {
					operationId: "createInventoryItem",
					summary: "Track stock for a catalog item or variant",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Stock record created." },
						"400": { description: "The catalog item or variant is invalid." },
					},
				},
			},
			"/v1/inventory/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getInventoryItem",
					responses: {
						"200": { description: "The stock record with its balances." },
						"404": { description: "Stock record not found." },
					},
				},
				patch: {
					operationId: "updateInventoryItem",
					summary: "Change the low-stock threshold or metadata",
					responses: { "200": { description: "Stock record updated." } },
				},
				delete: {
					operationId: "deleteInventoryItem",
					responses: {
						"200": { description: "Stock record deleted." },
						"409": {
							description:
								"Must be archived, at zero balance, and free of movement history.",
						},
					},
				},
			},
			"/v1/inventory/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setInventoryItemStatus",
					summary: "Move a stock record between active and archived",
					responses: {
						"200": { description: "Status changed." },
						"409": {
							description: "Redundant change, or reserved units remain.",
						},
					},
				},
			},
			"/v1/inventory/{id}/adjustments": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "listInventoryAdjustments",
					summary: "List recent stock movements, newest first",
					responses: { "200": { description: "The record's movements." } },
				},
				post: {
					operationId: "applyInventoryAdjustment",
					summary: "Record a stock movement and recalculate the balance",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Movement recorded." },
						"409": {
							description:
								"Insufficient available stock, or too few reserved units.",
						},
					},
				},
			},
			"/v1/shipments": {
				get: {
					operationId: "listShipments",
					summary: "List shipments, optionally for one order",
					responses: {
						"200": { description: "A cursor page of shipments." },
					},
				},
				post: {
					operationId: "createShipment",
					summary: "Create a draft shipment for a confirmed order",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Shipment created." },
						"409": {
							description:
								"The order isn't ready to ship, or the lines exceed what remains.",
						},
					},
				},
			},
			"/v1/shipping/quote": {
				post: {
					operationId: "quoteShipping",
					summary:
						"Quote eligible delivery rates from server-owned prices and weights",
					responses: {
						"200": { description: "Eligible delivery options." },
						"400": {
							description:
								"No zone or rate covers the basket, or an item weight is missing.",
						},
					},
				},
			},
			"/v1/shipping/zones": {
				get: {
					operationId: "listShippingZones",
					summary: "List shipping zones and their rates",
					responses: { "200": { description: "Shipping zones and rates." } },
				},
				post: {
					operationId: "createShippingZone",
					summary: "Create a shipping zone",
					responses: { "201": { description: "Shipping zone created." } },
				},
			},
			"/v1/shipping/zones/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				patch: {
					operationId: "updateShippingZone",
					responses: { "200": { description: "Shipping zone updated." } },
				},
				delete: {
					operationId: "deleteShippingZone",
					responses: {
						"200": { description: "Shipping zone deleted." },
						"409": { description: "The zone still has rates." },
					},
				},
			},
			"/v1/shipping/rates": {
				post: {
					operationId: "createShippingRate",
					summary: "Create a delivery rate inside a zone",
					responses: { "201": { description: "Shipping rate created." } },
				},
			},
			"/v1/shipping/rates/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				patch: {
					operationId: "updateShippingRate",
					responses: { "200": { description: "Shipping rate updated." } },
				},
				delete: {
					operationId: "deleteShippingRate",
					responses: { "200": { description: "Shipping rate deleted." } },
				},
			},
			"/v1/shipments/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getShipment",
					responses: {
						"200": { description: "The shipment with its lines and parcels." },
						"404": { description: "Shipment not found." },
					},
				},
				patch: {
					operationId: "updateDraftShipment",
					responses: {
						"200": { description: "Draft shipment updated." },
						"409": { description: "Only a draft shipment can be edited." },
					},
				},
				delete: {
					operationId: "deleteShipment",
					responses: {
						"200": { description: "Shipment deleted." },
						"409": {
							description: "Only a draft or cancelled shipment can be deleted.",
						},
					},
				},
			},
			"/v1/shipments/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setShipmentStatus",
					summary:
						"Move a shipment between draft, ready, shipped, in transit, delivered, exception, and cancelled",
					description:
						"The linked delivery record moves with it: shipped marks it in progress, delivered marks it fulfilled, and cancelled cancels it.",
					responses: {
						"200": { description: "Status changed." },
						"409": {
							description:
								"Illegal or redundant transition, or tracking is required first.",
						},
					},
				},
			},
			"/v1/shipments/{id}/tracking": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "updateShipmentTracking",
					summary: "Set or correct the carrier tracking details",
					responses: {
						"200": { description: "Tracking updated." },
						"409": {
							description:
								"Tracking is locked once a shipment is delivered or cancelled.",
						},
					},
				},
			},
			"/v1/projects": {
				get: {
					operationId: "listProjects",
					summary: "List projects, archived ones excluded by default",
					responses: { "200": { description: "A cursor page of projects." } },
				},
				post: {
					operationId: "createProject",
					summary: "Create a project",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Project created." },
						"400": { description: "The client reference is invalid." },
					},
				},
			},
			"/v1/projects/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getProject",
					responses: {
						"200": { description: "The project." },
						"404": { description: "Project not found." },
					},
				},
				patch: {
					operationId: "updateProject",
					responses: {
						"200": { description: "Project updated." },
						"409": { description: "The project is archived or closed." },
					},
				},
				delete: {
					operationId: "deleteProject",
					responses: {
						"200": { description: "Project deleted." },
						"409": { description: "The project must be archived first." },
					},
				},
			},
			"/v1/projects/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setProjectStatus",
					summary:
						"Move a project between draft, active, on hold, completed, and cancelled",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/projects/{id}/archive": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "archiveProject",
					summary: "Archive a completed or cancelled project",
					responses: {
						"200": { description: "Project archived." },
						"409": {
							description: "The project must be completed or cancelled first.",
						},
					},
				},
			},
			"/v1/projects/{id}/restore": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "restoreProject",
					summary: "Bring an archived project back",
					responses: {
						"200": { description: "Project restored." },
						"409": { description: "The project isn't archived." },
					},
				},
			},
			"/v1/milestones": {
				get: {
					operationId: "listMilestones",
					summary: "List milestones, optionally for one project",
					responses: { "200": { description: "A cursor page of milestones." } },
				},
				post: {
					operationId: "createMilestone",
					summary: "Create a milestone on a project",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Milestone created." },
						"409": { description: "The project is archived or closed." },
					},
				},
			},
			"/v1/milestones/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getMilestone",
					responses: {
						"200": { description: "The milestone." },
						"404": { description: "Milestone not found." },
					},
				},
				patch: {
					operationId: "updateMilestone",
					responses: {
						"200": { description: "Milestone updated." },
						"409": { description: "The milestone is closed." },
					},
				},
				delete: {
					operationId: "deleteMilestone",
					responses: {
						"200": { description: "Milestone deleted." },
						"409": {
							description:
								"It must be cancelled first, and must hold no tasks.",
						},
					},
				},
			},
			"/v1/milestones/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setMilestoneStatus",
					summary: "Move a milestone between open, completed, and cancelled",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/tasks": {
				get: {
					operationId: "listTasks",
					summary: "List tasks, optionally for one project or milestone",
					responses: { "200": { description: "A cursor page of tasks." } },
				},
				post: {
					operationId: "createTask",
					summary: "Create a task, optionally under a parent task",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Task created." },
						"400": {
							description:
								"The parent task belongs to a different project or milestone.",
						},
					},
				},
			},
			"/v1/tasks/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getTask",
					responses: {
						"200": { description: "The task." },
						"404": { description: "Task not found." },
					},
				},
				patch: {
					operationId: "updateTask",
					summary: "Edit a task, including re-parenting it",
					responses: {
						"200": { description: "Task updated." },
						"400": { description: "That change would create a parent cycle." },
					},
				},
				delete: {
					operationId: "deleteTask",
					responses: {
						"200": { description: "Task deleted." },
						"409": { description: "The task still has subtasks." },
					},
				},
			},
			"/v1/tasks/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setTaskStatus",
					summary:
						"Move a task between todo, in progress, blocked, completed, and cancelled",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/bookings": {
				get: {
					operationId: "listBookings",
					summary: "List bookings, optionally by schedule or start-time window",
					responses: { "200": { description: "A cursor page of bookings." } },
				},
				post: {
					operationId: "createBooking",
					summary: "Book a slot",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Booking created." },
						"409": {
							description:
								"The slot overlaps a live booking on the same schedule.",
						},
					},
				},
			},
			"/v1/bookings/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getBooking",
					responses: {
						"200": { description: "The booking." },
						"404": { description: "Booking not found." },
					},
				},
				patch: {
					operationId: "updateBooking",
					summary: "Reschedule or edit a booking that hasn't started",
					responses: {
						"200": { description: "Booking updated." },
						"409": {
							description:
								"Only a requested or confirmed booking can be changed.",
						},
					},
				},
				delete: {
					operationId: "deleteBooking",
					responses: {
						"200": { description: "Booking deleted." },
						"409": {
							description:
								"Only a requested or cancelled booking can be deleted.",
						},
					},
				},
			},
			"/v1/bookings/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setBookingStatus",
					summary:
						"Move a booking between requested, confirmed, checked in, completed, cancelled, and no show",
					description:
						"Cancelling frees the slot, so the same time can be booked again.",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/time-entries": {
				get: {
					operationId: "listTimeEntries",
					summary:
						"List time entries, optionally by project, task, tracker, or window",
					responses: {
						"200": { description: "A cursor page of time entries." },
					},
				},
				post: {
					operationId: "createManualTimeEntry",
					summary: "Log time manually",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Time entry created." },
						"409": {
							description:
								"The time overlaps another entry, or the project is closed.",
						},
					},
				},
			},
			"/v1/time-entries/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getTimeEntry",
					responses: {
						"200": { description: "The time entry." },
						"404": { description: "Time entry not found." },
					},
				},
				patch: {
					operationId: "updateManualTimeEntry",
					responses: {
						"200": { description: "Time entry updated." },
						"409": { description: "The entry can no longer be edited." },
					},
				},
				delete: {
					operationId: "deleteTimeEntry",
					responses: {
						"200": { description: "Time entry deleted." },
						"409": {
							description: "Approved or invoiced time can't be deleted.",
						},
					},
				},
			},
			"/v1/timers": {
				post: {
					operationId: "startTimer",
					summary: "Start a timer on a tracker",
					description:
						"Retrying with the same Idempotency-Key replays the same timer. A genuine second timer on the same tracker is refused.",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Timer started." },
						"409": {
							description: "A timer is already running, or the time overlaps.",
						},
					},
				},
			},
			"/v1/timers/{id}/stop": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "stopTimer",
					summary: "Stop a running timer and record its duration",
					responses: {
						"200": { description: "Timer stopped." },
						"409": { description: "That entry has no running timer." },
					},
				},
			},
			"/v1/time-entries/{id}/approve": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "approveTimeEntry",
					summary: "Approve time, applying the workspace's billing rounding",
					responses: {
						"200": { description: "Time approved." },
						"409": {
							description: "The entry can't be approved from its status.",
						},
					},
				},
			},
			"/v1/time-entries/{id}/unapprove": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "unapproveTimeEntry",
					responses: {
						"200": { description: "Approval withdrawn." },
						"409": { description: "Invoiced time can't be unapproved." },
					},
				},
			},
			"/v1/time-entries/{id}/void": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "voidTimeEntry",
					summary: "Void time without deleting it",
					responses: {
						"200": { description: "Time voided." },
						"409": {
							description: "The entry can't be voided from its status.",
						},
					},
				},
			},
			"/v1/time-entries/{id}/restore": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "restoreVoidedTimeEntry",
					responses: {
						"200": { description: "Voided time restored." },
						"409": { description: "Only voided time can be restored." },
					},
				},
			},
			"/v1/time-entries/invoice": {
				post: {
					operationId: "invoiceApprovedTimeEntries",
					summary: "Attach approved billable time to a draft invoice",
					description:
						"The invoice and every entry move together in one transaction, so time is never marked invoiced against an invoice that didn't change.",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"200": { description: "Time attached to the invoice." },
						"409": {
							description:
								"Time is not approved, not billable, already invoiced, or the invoice is not a draft.",
						},
					},
				},
			},
			"/v1/time-entries/detach": {
				post: {
					operationId: "detachTimeEntriesFromDraftInvoice",
					summary: "Detach time from a draft invoice",
					responses: {
						"200": { description: "Time detached." },
						"409": { description: "The invoice is no longer a draft." },
					},
				},
			},
			"/v1/contracts": {
				get: {
					operationId: "listContracts",
					summary: "List contracts, optionally by client or status",
					responses: { "200": { description: "A cursor page of contracts." } },
				},
				post: {
					operationId: "createContract",
					summary: "Create a draft contract",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Contract created." },
						"409": {
							description: "The attached document version isn't available.",
						},
					},
				},
			},
			"/v1/contracts/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getContract",
					summary: "Fetch a contract with its signers",
					description:
						"Signer token material is never returned; signing links are delivered out of band.",
					responses: {
						"200": { description: "The contract and its signers." },
						"404": { description: "Contract not found." },
					},
				},
				patch: {
					operationId: "updateDraftContract",
					responses: {
						"200": { description: "Draft contract updated." },
						"409": { description: "Only a draft contract can be edited." },
					},
				},
				delete: {
					operationId: "deleteDraftContract",
					responses: {
						"200": { description: "Draft contract deleted." },
						"409": { description: "Only a draft contract can be deleted." },
					},
				},
			},
			"/v1/contracts/{id}/send": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "sendContract",
					summary: "Send a contract for signature",
					description:
						"Mints a signing link per signer. The response carries invitation metadata only — raw signing tokens are never returned, logged, audited, or stored for replay.",
					responses: {
						"200": { description: "Contract sent." },
						"409": {
							description:
								"The contract has no signers, or can't be sent from its status.",
						},
					},
				},
			},
			"/v1/contracts/{id}/expire": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "expireContract",
					responses: {
						"200": { description: "Contract expired." },
						"409": {
							description: "The contract can't be expired from its status.",
						},
					},
				},
			},
			"/v1/contracts/{id}/void": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "voidContract",
					responses: {
						"200": { description: "Contract voided." },
						"409": {
							description: "The contract can't be voided from its status.",
						},
					},
				},
			},
			"/v1/contracts/{id}/revise": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "reviseContract",
					summary: "Supersede a contract with a new revision",
					responses: {
						"201": {
							description: "Revision created; the source is superseded.",
						},
						"409": {
							description: "The contract can't be revised from its status.",
						},
					},
				},
			},
			"/v1/file-folders": {
				get: {
					operationId: "listFileFolders",
					summary: "List folders, optionally by parent or root only",
					responses: { "200": { description: "A cursor page of folders." } },
				},
				post: {
					operationId: "createFileFolder",
					summary: "Create a folder",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"201": { description: "Folder created." },
						"409": { description: "The workspace is archived." },
					},
				},
			},
			"/v1/file-folders/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				patch: {
					operationId: "updateFileFolder",
					summary: "Rename or move a folder",
					responses: {
						"200": { description: "Folder updated." },
						"400": { description: "A folder can't be moved inside itself." },
					},
				},
				delete: {
					operationId: "deleteFileFolder",
					responses: {
						"200": { description: "Folder deleted." },
						"409": {
							description: "The folder still holds subfolders or documents.",
						},
					},
				},
			},
			"/v1/documents": {
				get: {
					operationId: "listFileDocuments",
					summary: "List documents, optionally by folder or status",
					responses: { "200": { description: "A cursor page of documents." } },
				},
			},
			"/v1/documents/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "getFileDocument",
					summary: "Fetch a document with its version history",
					description:
						"Internal storage addressing is never returned; downloads are granted separately as time-limited links.",
					responses: {
						"200": { description: "The document and its versions." },
						"404": { description: "Document not found." },
					},
				},
				patch: {
					operationId: "updateFileDocument",
					responses: {
						"200": { description: "Document updated." },
						"409": { description: "The document can no longer be edited." },
					},
				},
				delete: {
					operationId: "deleteFileDocument",
					summary: "Permanently delete a trashed document",
					description:
						"The deletion request commits before durable storage cleanup is queued. Active or archived documents must be trashed first.",
					parameters: [
						{
							in: "header",
							name: "Idempotency-Key",
							required: true,
							schema: { type: "string" },
						},
					],
					responses: {
						"200": { description: "Deletion requested and cleanup queued." },
						"409": {
							description:
								"The document is not trashed or another relationship blocks deletion.",
						},
					},
				},
			},
			"/v1/documents/{id}/status": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "setFileDocumentStatus",
					summary: "Move a document between active, archived, and trashed",
					description:
						"Permanent deletion uses DELETE /v1/documents/{id} so storage cleanup cannot be bypassed.",
					responses: {
						"200": { description: "Status changed." },
						"409": { description: "Illegal or redundant transition." },
					},
				},
			},
			"/v1/documents/{id}/attachments": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				get: {
					operationId: "listFileAttachments",
					summary: "List what this document is attached to",
					responses: { "200": { description: "The document's attachments." } },
				},
			},
			"/v1/file-versions/{id}/release": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				post: {
					operationId: "releaseQuarantinedFileVersion",
					summary: "Release a quarantined version for use",
					responses: {
						"200": { description: "Version released." },
						"409": { description: "That version isn't quarantined." },
					},
				},
			},
			"/v1/file-attachments/{id}": {
				parameters: [
					{
						in: "path",
						name: "id",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				delete: {
					operationId: "removeFileAttachment",
					responses: {
						"200": { description: "Attachment removed." },
						"404": { description: "Attachment not found." },
					},
				},
			},
			"/v1/reports/workspace": {
				get: {
					operationId: "getWorkspaceReport",
					summary: "Cross-module snapshot for a date range",
					description:
						"Sections for modules the workspace hasn't enabled come back unavailable rather than zeroed, so absent data is distinguishable from switched-off modules.",
					parameters: [
						{
							in: "query",
							name: "from",
							schema: { type: "string", format: "date-time" },
							description: "Range start. Defaults to 30 days before `to`.",
						},
						{
							in: "query",
							name: "to",
							schema: { type: "string", format: "date-time" },
							description: "Range end. Defaults to now.",
						},
						{
							in: "query",
							name: "timeZone",
							schema: { type: "string", default: "UTC" },
							description: "IANA time zone the range is bucketed in.",
						},
						{
							in: "query",
							name: "granularity",
							schema: { type: "string", enum: ["day", "week", "month"] },
						},
					],
					responses: {
						"200": { description: "The report." },
						"400": { description: "Invalid range, time zone, or granularity." },
						"404": { description: "Workspace not found." },
					},
				},
			},
			"/v1/reports/revenue": {
				get: {
					operationId: "getRevenueSeries",
					summary: "Collected and refunded revenue over time, per currency",
					parameters: [
						{
							in: "query",
							name: "from",
							schema: { type: "string", format: "date-time" },
							description: "Range start. Defaults to 30 days before `to`.",
						},
						{
							in: "query",
							name: "to",
							schema: { type: "string", format: "date-time" },
							description: "Range end. Defaults to now.",
						},
						{
							in: "query",
							name: "timeZone",
							schema: { type: "string", default: "UTC" },
							description: "IANA time zone the range is bucketed in.",
						},
						{
							in: "query",
							name: "granularity",
							schema: { type: "string", enum: ["day", "week", "month"] },
						},
					],
					responses: { "200": { description: "Revenue series." } },
				},
			},
			"/v1/reports/traffic": {
				get: {
					operationId: "getTrafficSeries",
					summary: "Self-reported site traffic over time",
					parameters: [
						{
							in: "query",
							name: "from",
							schema: { type: "string", format: "date-time" },
							description: "Range start. Defaults to 30 days before `to`.",
						},
						{
							in: "query",
							name: "to",
							schema: { type: "string", format: "date-time" },
							description: "Range end. Defaults to now.",
						},
						{
							in: "query",
							name: "timeZone",
							schema: { type: "string", default: "UTC" },
							description: "IANA time zone the range is bucketed in.",
						},
						{
							in: "query",
							name: "granularity",
							schema: { type: "string", enum: ["day", "week", "month"] },
						},
					],
					responses: { "200": { description: "Traffic series." } },
				},
			},
			"/v1/reports/traffic/summary": {
				get: {
					operationId: "getTrafficSummary",
					summary: "Traffic totals for a range",
					parameters: [
						{
							in: "query",
							name: "from",
							schema: { type: "string", format: "date-time" },
							description: "Range start. Defaults to 30 days before `to`.",
						},
						{
							in: "query",
							name: "to",
							schema: { type: "string", format: "date-time" },
							description: "Range end. Defaults to now.",
						},
						{
							in: "query",
							name: "timeZone",
							schema: { type: "string", default: "UTC" },
							description: "IANA time zone the range is bucketed in.",
						},
						{
							in: "query",
							name: "granularity",
							schema: { type: "string", enum: ["day", "week", "month"] },
						},
					],
					responses: { "200": { description: "Traffic summary." } },
				},
			},
			"/v1/events": {
				post: {
					operationId: "recordTrafficEvent",
					summary: "Record one self-reported traffic event",
					description:
						"The only write a publishable key may perform. Visitor and session ids are hashed server-side with a per-workspace salt, so raw ids are never stored, and `path` must carry no query string. Idempotent on `eventId`: a repeat returns `accepted: false` rather than an error, so no Idempotency-Key is required.",
					responses: {
						"200": {
							description:
								"Recorded, or already known — `accepted` distinguishes the two.",
						},
						"400": {
							description: "Event is malformed, future-dated, or too old.",
						},
						"403": { description: "Reporting & Analytics isn't enabled." },
					},
				},
			},
			"/v1/webhook-endpoints": {
				get: {
					operationId: "listWebhookEndpoints",
					summary: "List this workspace's webhook endpoints",
					description:
						"Signing secrets are never returned. A secret is shown once, when the endpoint is created.",
					responses: { "200": { description: "The endpoints." } },
				},
				post: {
					operationId: "createWebhookEndpoint",
					summary: "Register a webhook endpoint",
					description:
						"The response is the only time the signing secret is returned — store it before discarding the response. `eventTypes` may be omitted or empty to receive every event. The URL must use https, except for localhost during development.",
					responses: {
						"201": {
							description: "The endpoint, including its signing secret.",
						},
						"400": { description: "Invalid or insecure URL." },
						"409": {
							description: "The workspace's endpoint limit is reached.",
						},
					},
				},
			},
			"/v1/webhook-endpoints/{id}": {
				get: {
					operationId: "getWebhookEndpoint",
					summary: "Read one webhook endpoint",
					responses: {
						"200": { description: "The endpoint." },
						"404": { description: "Endpoint not found." },
					},
				},
				patch: {
					operationId: "updateWebhookEndpoint",
					summary: "Update a webhook endpoint",
					description:
						"Re-enabling an endpoint the platform disabled also clears the recorded reason.",
					responses: {
						"200": { description: "The updated endpoint." },
						"404": { description: "Endpoint not found." },
					},
				},
				delete: {
					operationId: "deleteWebhookEndpoint",
					summary: "Delete a webhook endpoint",
					description: "Its delivery history is removed with it.",
					responses: {
						"200": { description: "The deleted endpoint id." },
						"404": { description: "Endpoint not found." },
					},
				},
			},
			"/v1/webhook-endpoints/{id}/deliveries": {
				get: {
					operationId: "listWebhookDeliveries",
					summary: "Delivery history for an endpoint, newest first",
					parameters: [
						{
							in: "query",
							name: "limit",
							schema: { type: "integer", default: 50, maximum: 100 },
						},
						{
							in: "query",
							name: "cursor",
							schema: { type: "string", format: "date-time" },
						},
					],
					responses: {
						"200": { description: "The deliveries." },
						"404": { description: "Endpoint not found." },
					},
				},
			},
			"/v1/webhook-deliveries/{id}/replay": {
				post: {
					operationId: "replayWebhookDelivery",
					summary: "Queue a delivery to be attempted again",
					description:
						"Resets the delivery's attempt counter and schedules it immediately. Delivery is at-least-once: consumers must dedupe on the event id.",
					responses: {
						"202": { description: "The delivery, queued again." },
						"404": { description: "Delivery not found." },
					},
				},
			},
			"/v1/account/organizations": {
				get: {
					operationId: "listOrganizations",
					summary: "Organizations you belong to",
					responses: {
						"200": { description: "Your organizations." },
						"401": { description: "Sign in to continue." },
					},
				},
				post: {
					operationId: "createOrganization",
					summary: "Create an organization",
					description:
						"Needs only a signed-in session \u2014 there is no organization to be a member of yet.",
					responses: {
						"201": { description: "The organization was created." },
						"400": { description: "A name is required." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/state": {
				get: {
					operationId: "getAccountState",
					summary: "Read first-run account state",
					description:
						"Returns the fresh onboarding completion state used to route a signed-in user.",
					responses: {
						"200": { description: "The account state." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/module-catalog": {
				get: {
					operationId: "getAccountModuleCatalog",
					summary: "List built and upcoming workspace modules",
					responses: {
						"200": { description: "The onboarding module catalog." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/onboarding/recommend": {
				post: {
					operationId: "recommendAccountOnboarding",
					summary: "Recommend a workspace recipe",
					description:
						"Chooses from the submitted bounded recipe catalog. Falls back deterministically when the optional model provider is unavailable.",
					responses: {
						"200": { description: "A recipe recommendation." },
						"400": { description: "The business description is invalid." },
						"401": { description: "Sign in to continue." },
						"429": { description: "The recommendation limit was reached." },
					},
				},
			},
			"/v1/account/api-capabilities": {
				get: {
					operationId: "listAccountApiCapabilities",
					summary: "List capabilities assignable to scoped API keys",
					responses: {
						"200": { description: "The API capability catalog." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/api-keys": {
				get: {
					operationId: "listApiKeys",
					summary: "List API key metadata",
					description:
						"Returns non-secret metadata only. Plaintext keys are available exactly once, when created.",
					responses: {
						"200": { description: "The workspace's API keys." },
						"404": { description: "Workspace not found." },
					},
				},
				post: {
					operationId: "createApiKey",
					summary: "Issue an API key",
					description:
						"The plaintext key is returned **exactly once** and can never be retrieved again \u2014 only a hash and a short recognisable prefix are stored. Lose it and you issue a new one. A key that can be read back out of the database is a key that leaks with the database.",
					responses: {
						"201": { description: "The key was issued. Store it now." },
						"403": { description: "You cannot manage API keys." },
					},
				},
			},
			"/v1/account/api-keys/{id}": {
				patch: {
					operationId: "updateApiKeyOrigins",
					summary: "Change which websites may use a key",
					description:
						"Replaces the allowed-origin list rather than adding to it, because removing a domain you no longer control is the operation that matters. Origins are normalised to scheme + host + port and anything that will not parse as an origin is dropped, so a stored value can always match a browser's `Origin` header. Takes effect within seconds — the CORS decision cache is cleared here. A revoked key cannot be edited.",
					responses: {
						"200": { description: "The stored, normalised origin list." },
						"403": { description: "You cannot manage API keys." },
						"404": { description: "No such key, or no such workspace." },
					},
				},
				delete: {
					operationId: "revokeApiKey",
					summary: "Revoke an API key",
					description:
						"Takes effect immediately. Anything using the key stops working.",
					responses: {
						"200": { description: "The key was revoked." },
						"400": { description: "workspaceId is required." },
						"403": { description: "You cannot manage API keys." },
						"404": { description: "No such key." },
					},
				},
			},
			"/v1/account/plan": {
				get: {
					operationId: "getAccountPlan",
					summary: "The plan in force, and current usage",
					responses: {
						"200": { description: "The plan, subscription and usage." },
						"403": { description: "You cannot view this organization." },
					},
				},
			},
			"/v1/account/subscription": {
				post: {
					operationId: "startSubscription",
					summary: "Begin a subscription",
					description:
						"Returns a client secret for Stripe Elements. **No plan change is applied here** \u2014 it lands when Stripe confirms payment, so an abandoned checkout can never leave an account on a plan nobody paid for.",
					responses: {
						"201": { description: "Checkout started." },
						"403": { description: "You cannot manage billing." },
						"503": {
							description: "That plan is not available for checkout yet.",
						},
					},
				},
			},
			"/v1/account/subscription/confirm": {
				post: {
					operationId: "confirmAccountSubscription",
					summary: "Reconcile a completed Stripe subscription",
					description:
						"Updates the account immediately after Payment Element returns. Stripe webhooks remain the production source of truth.",
					responses: {
						"200": { description: "The subscription was reconciled." },
						"403": { description: "You cannot manage billing." },
					},
				},
			},
			"/v1/account/billing/pricing": {
				get: {
					operationId: "getAccountBillingPricing",
					summary: "Read live plan pricing and the current plan",
					responses: {
						"200": { description: "Live Stripe pricing and current plan." },
						"403": { description: "You cannot manage billing." },
					},
				},
			},
			"/v1/account/notifications/{id}/read": {
				post: {
					operationId: "markNotificationRead",
					summary: "Mark a notification read",
					description:
						"Scoped to you \u2014 one person can never mark another's as read.",
					responses: {
						"200": { description: "Marked as read." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/notifications": {
				get: {
					operationId: "listNotifications",
					summary: "List your notifications",
					responses: {
						"200": { description: "Notifications and unread count." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account/notifications/read-all": {
				post: {
					operationId: "markAllNotificationsRead",
					summary: "Mark every notification read",
					responses: {
						"200": { description: "All marked as read." },
						"401": { description: "Sign in to continue." },
					},
				},
			},
			"/v1/account": {
				delete: {
					operationId: "deleteAccount",
					summary: "Permanently delete your account",
					description:
						"Irreversible, and always your own account \u2014 the user is taken from your session and never from a parameter. Refused while any workspace you own still holds files, because deleting the records would leave the stored bytes orphaned.",
					responses: {
						"200": { description: "The account was deleted." },
						"401": { description: "Sign in to continue." },
						"409": { description: "Delete your files first." },
					},
				},
			},
			"/v1/account/invitations": {
				get: {
					operationId: "listInvitations",
					summary: "Invitations for this organization",
					responses: {
						"200": { description: "The organization's invitations." },
						"403": { description: "You cannot manage members." },
					},
				},
				post: {
					operationId: "inviteMember",
					summary: "Invite someone to the organization",
					description:
						"The role may be any the organization has defined, not only the built-in three. You cannot invite someone to a role carrying more permissions than you hold yourself. The returned token is shown once, to be emailed; it is stored hashed and can never be read back.",
					responses: {
						"201": { description: "The invitation was created." },
						"400": { description: "Unknown role or invalid email." },
						"403": {
							description: "That role carries more permissions than your own.",
						},
					},
				},
			},
			"/v1/account/invitations/{token}/accept": {
				post: {
					operationId: "acceptInvitation",
					summary: "Accept an invitation",
					description:
						"Requires only a signed-in session: the invitee has no role in the organization yet, so the token is the authorization. Single-use and expiring. Every failure returns the same message, because distinguishing expired from already-used from never-existed would let someone probe for valid tokens.",
					responses: {
						"200": { description: "You joined the organization." },
						"401": { description: "Sign in to accept an invitation." },
						"404": { description: "That invitation is no longer valid." },
					},
				},
			},
			"/v1/account/invitations/{id}": {
				get: {
					operationId: "getInvitation",
					summary: "Preview an invitation",
					description:
						"The token is the authorization. Invalid, expired and used invitations are indistinguishable.",
					responses: {
						"200": { description: "Invitation details." },
						"404": { description: "That invitation is no longer valid." },
					},
				},
				delete: {
					operationId: "revokeInvitation",
					summary: "Revoke a pending invitation",
					responses: {
						"200": { description: "The invitation was revoked." },
						"403": { description: "You cannot manage members." },
						"404": { description: "No such invitation." },
					},
				},
			},
			"/v1/account/members/{userId}": {
				delete: {
					operationId: "removeMember",
					summary: "Remove a member",
					description:
						"The organization owner cannot be removed. An organization with no owner has nobody able to manage billing or appoint a replacement, and there is no way back from it.",
					responses: {
						"200": { description: "The member was removed." },
						"403": { description: "You cannot manage members." },
						"409": { description: "The owner must be replaced first." },
					},
				},
			},
			"/v1/account/members": {
				get: {
					operationId: "listAccountMembers",
					summary: "List organization members",
					responses: {
						"200": { description: "The organization's members." },
						"403": { description: "You cannot view this organization." },
					},
				},
			},
			"/v1/account/workspaces": {
				get: {
					operationId: "listAccountWorkspaces",
					summary: "List workspaces in an organization",
					responses: {
						"200": { description: "Active and archived workspaces." },
						"403": { description: "You cannot view these workspaces." },
					},
				},
				post: {
					operationId: "createWorkspace",
					summary: "Create a workspace",
					description:
						"Enabling a module that builds on another brings its prerequisites with it, so a workspace can never be left in a configuration that cannot work. Omitting `moduleIds` enables the foundation set.",
					responses: {
						"201": { description: "The workspace was created." },
						"400": { description: "Invalid name, business type or module." },
						"401": { description: "Sign in to continue." },
						"409": {
							description: "This account already has its first workspace.",
						},
					},
				},
			},
			"/v1/account/workspaces/{id}": {
				patch: {
					operationId: "renameWorkspace",
					summary: "Rename a workspace",
					responses: {
						"200": { description: "The workspace was renamed." },
						"400": { description: "The name is empty or too long." },
						"403": { description: "You cannot manage this workspace." },
						"404": { description: "No such workspace." },
					},
				},
				delete: {
					operationId: "deleteWorkspace",
					summary: "Permanently delete a workspace",
					description:
						"Destroys every record the workspace holds and cannot be undone. Archiving covers every reversible case, which is why this needs a separate, stronger permission.",
					responses: {
						"200": { description: "The workspace was deleted." },
						"403": { description: "Only an owner may delete a workspace." },
						"404": { description: "No such workspace." },
					},
				},
			},
			"/v1/account/workspaces/{id}/archive": {
				post: {
					operationId: "setWorkspaceArchived",
					summary: "Archive or restore a workspace",
					description:
						"Reversible, and keeps every record — it only takes the workspace out of the active list.",
					responses: {
						"200": { description: "The workspace was archived or restored." },
						"403": { description: "You cannot manage this workspace." },
						"404": { description: "No such workspace." },
					},
				},
			},
			"/v1/account/workspaces/{id}/environment": {
				patch: {
					operationId: "setWorkspaceEnvironment",
					summary: "Choose test or live operation",
					description:
						"A workspace locks to its environment when it gains a payment account, order or payment. Going live after testing requires a separate workspace so sandbox records can never become business history.",
					responses: {
						"200": { description: "The workspace environment changed." },
						"403": { description: "You cannot manage this workspace." },
						"404": { description: "No such workspace." },
						"409": {
							description: "The workspace environment is already locked.",
						},
					},
				},
			},
			"/v1/account/workspaces/{id}/modules/{moduleId}": {
				put: {
					operationId: "setWorkspaceModuleEnabled",
					summary: "Enable or disable a module",
					description:
						"Enabling resolves dependencies, so a module that composes on another brings its prerequisite along. Enabling something already enabled is a no-op rather than an error.",
					responses: {
						"200": { description: "The module was enabled or disabled." },
						"400": { description: "That module does not exist." },
						"403": { description: "You cannot manage modules." },
					},
				},
			},
			"/v1/roles": {
				get: {
					operationId: "listRoles",
					summary: "Roles this organization has defined for itself",
					description:
						"Custom roles only. The built-in `owner`, `admin`, and `member` roles live in code rather than in data, so they are always available and are never returned here.",
					responses: {
						"200": { description: "The organization's custom roles." },
						"403": { description: "The caller cannot manage members." },
					},
				},
				post: {
					operationId: "createRole",
					summary: "Define a custom role",
					description:
						"A role is a name plus a list of permissions, and only the list carries meaning \u2014 nothing in the product branches on the name. Two rules are enforced here rather than in a form: a caller may not grant a permission it does not itself hold, and a custom role may not take the name of a built-in one.",
					responses: {
						"201": { description: "The role was created." },
						"400": { description: "Invalid name or unknown permission." },
						"403": {
							description:
								"The caller cannot manage members, or tried to grant a permission it does not hold.",
						},
						"409": {
							description:
								"That name is already taken, or is the name of a built-in role.",
						},
					},
				},
			},
			"/v1/roles/{id}": {
				patch: {
					operationId: "updateRole",
					summary: "Rename a role or change what it grants",
					description:
						"Members holding the role pick up the change on their next request; no reassignment is needed, because authorization reads the permission list rather than the name.",
					responses: {
						"200": { description: "The role was updated." },
						"403": {
							description:
								"Cannot grant a permission the caller does not hold.",
						},
						"404": { description: "No such role in this organization." },
						"409": { description: "That name belongs to a built-in role." },
					},
				},
				delete: {
					operationId: "deleteRole",
					summary: "Delete a custom role",
					description:
						"Refused while any member still holds the role. Deleting it would leave them with no permissions at all, losing access silently and with nothing to explain why \u2014 so move them to another role first.",
					responses: {
						"200": { description: "The role was deleted." },
						"404": { description: "No such role in this organization." },
						"409": { description: "Members still hold this role." },
					},
				},
			},
			"/v1/realtime/auth": {
				post: {
					operationId: "authorizeRealtimeChannel",
					summary: "Authorize a browser's subscription to a workspace channel",
					description:
						"Called by the realtime client, not directly. Accepts `socket_id` and `channel_name` as form fields and returns the provider's own auth payload. A caller may only authorize the channel belonging to its own workspace.",
					responses: {
						"200": { description: "The subscription is authorized." },
						"400": {
							description: "Missing socket id or unrecognised channel.",
						},
						"403": {
							description: "That channel belongs to another workspace.",
						},
						"503": { description: "Realtime is not configured." },
					},
				},
			},
			// ── Quote lifecycle ─────────────────────────────────────────────────
			// Shipped 2026-07-27 (TECH_DEBT 5) and never documented.
			"/v1/quotes/{id}/expire": {
				post: {
					operationId: "expireQuote",
					summary: "Mark a quote expired",
					description:
						"A quote past its valid-until date. Writes audit and outbox records like every other lifecycle change.",
					responses: { "200": { description: "The expired quote." } },
				},
			},
			"/v1/quotes/{id}/revise": {
				post: {
					operationId: "reviseQuote",
					summary: "Supersede a quote with a new revision",
					responses: { "201": { description: "The new revision." } },
				},
			},
			"/v1/quotes/{id}/void": {
				post: {
					operationId: "voidQuote",
					summary: "Void a quote",
					responses: { "200": { description: "The voided quote." } },
				},
			},

			// ── Bookings → Invoicing ────────────────────────────────────────────
			"/v1/bookings/{id}/invoice": {
				post: {
					operationId: "invoiceBooking",
					summary: "Raise a draft invoice from a completed booking",
					description:
						"Idempotent by the booking itself, not only by the header: calling twice returns the same invoice with 200 rather than billing again. The service description and price are recorded as they were on the day, so repricing later never rewrites an issued bill. Only a completed booking can be invoiced.",
					responses: {
						"201": { description: "The invoice that was created." },
						"200": {
							description: "The invoice that already existed for this booking.",
						},
						"402": {
							description: "Invoicing is not enabled on this workspace.",
						},
					},
				},
			},

			// ── Saved views ─────────────────────────────────────────────────────
			"/v1/saved-views": {
				get: {
					operationId: "listSavedViews",
					summary: "Saved views for a module, or everything pinned",
					description:
						"With `moduleId`, that module's views in the caller's order. Without it, every pinned view across all modules — what a home page asks for. Views are personal: one member never sees another's.",
					parameters: [
						{ in: "query", name: "moduleId", schema: { type: "string" } },
					],
					responses: { "200": { description: "The caller's saved views." } },
				},
				post: {
					operationId: "saveView",
					summary: "Create or update a saved view",
					description:
						"Saving twice under one name updates it rather than erroring or creating a duplicate.",
					responses: {
						"201": { description: "The saved view." },
						"403": {
							description:
								"An API key cannot own a view. Use a signed-in session.",
						},
					},
				},
			},
			"/v1/saved-views/{id}": {
				delete: {
					operationId: "deleteSavedView",
					summary: "Delete one of the caller's saved views",
					responses: { "200": { description: "Deleted." } },
				},
			},
			"/v1/saved-views/{id}/pin": {
				post: {
					operationId: "pinSavedView",
					summary: "Pin or unpin a saved view",
					responses: { "200": { description: "The updated view." } },
				},
			},

			// ── Diagnostics ─────────────────────────────────────────────────────
			"/v1/integration-health": {
				get: {
					operationId: "getIntegrationHealth",
					summary: "Which capabilities are degraded",
					description:
						"Reports providers running on a stand-in and what stops working. `severity` escalates `data-loss` above `feature-loss`. Carries environment variable NAMES only, never values.",
					responses: { "200": { description: "Current provider health." } },
				},
			},
			"/v1/requests/{requestId}": {
				get: {
					operationId: "getRequestTrace",
					summary: "What happened under one request id",
					description:
						"The mutations and audit events for a request id this API returned. Stored response bodies are deliberately excluded — they hold customer records.",
					responses: { "200": { description: "The request trace." } },
				},
			},
			"/v1/support-bundle": {
				get: {
					operationId: "getSupportBundle",
					summary: "A diagnostic snapshot to attach to a support request",
					description:
						"Workspace, modules, credential metadata, webhook configuration and recent operations. Built from an explicit allowlist, so it can carry no credential and no customer record.",
					responses: { "200": { description: "The support bundle." } },
				},
			},

			// ── Product analytics ───────────────────────────────────────────────
			"/v1/product-events": {
				post: {
					operationId: "recordProductEvent",
					summary: "Record a product event from a browser",
					description:
						"For moments only a client can observe. The event name is validated against the contract, and the person is taken from the session rather than the body. Properties that look like content are dropped.",
					responses: {
						"202": {
							description: "Accepted. Telemetry is recorded asynchronously.",
						},
					},
				},
			},

			// ── Customer API ────────────────────────────────────────────────────
			// Our USERS' USERS: a shopper, a massage client, a student. Authenticated
			// by a publishable key (which workspace) plus a customer session (which
			// person). A customer session can never satisfy an operator route.
			"/v1/customer/bootstrap/{slug}": {
				get: {
					operationId: "bootstrapCustomerPortal",
					summary: "Resolve a hosted portal from its URL slug",
					description:
						"The one customer route needing no publishable key, because it is what hands the key over: a visitor arriving at a portal address holds no credential yet. Returns the workspace's public identity, its branding, and its publishable key, which is public by construction. An unknown slug and a portal that is switched off answer identically, so the namespace cannot be walked to inventory which businesses exist.",
					parameters: [
						{
							name: "slug",
							in: "path",
							required: true,
							schema: { type: "string" },
							description: "The portal's URL segment.",
						},
					],
					responses: {
						"200": {
							description: "Workspace id, branding and the publishable key.",
						},
						"404": { description: "No portal is published at this address." },
					},
				},
			},
			"/v1/customer/context": {
				get: {
					operationId: "getCustomerContext",
					summary: "The workspace behind a publishable key, and its modules",
					description:
						"Public. Drives a portal's navigation the same way enabled modules drive QuickDash's sidebar. Carries the workspace's public identity only — nothing about its operators, billing or customers.",
					responses: {
						"200": { description: "Workspace name, slug and enabled modules." },
					},
				},
			},
			// ── The portal's own domain ──────────────────────────────────────────
			"/v1/portal/domain": {
				get: {
					operationId: "readPortalDomain",
					summary: "The domain this workspace's customer portal answers on",
					responses: { "200": { description: "The custom domain, or null." } },
				},
				put: {
					operationId: "setPortalDomain",
					summary: "Put the customer portal on your own domain",
					description:
						"White-labelling: a business pointing account.theirshop.com at us gets its portal there, and its customers never see a QuickDash address. Send null to remove it and fall back to the path-based address. The response includes the CNAME target, because a domain that resolves nowhere is the most likely support question this creates. Setting a domain proves nothing about owning it — DNS does, since only the zone's controller can point a CNAME.",
					responses: {
						"200": {
							description: "The stored domain and the CNAME to create.",
						},
						"400": { description: "That is not a valid domain." },
						"404": {
							description: "Publish the portal before giving it a domain.",
						},
						"409": { description: "Already connected to another workspace." },
					},
				},
			},
			"/v1/customer/bootstrap-by-host": {
				get: {
					operationId: "bootstrapPortalByHost",
					summary: "Resolve a portal from the host the visitor typed",
					description:
						"The white-label counterpart to bootstrap-by-slug. Reads the Origin header rather than Host: a reverse proxy rewrites Host to its own upstream, so trusting it would resolve every custom-domain visit to whatever the proxy calls itself. An unknown host and a switched-off portal answer identically, so this cannot be walked to inventory customers.",
					responses: {
						"200": { description: "Workspace, branding and publishable key." },
						"404": { description: "No portal is published at this address." },
					},
				},
			},
			"/v1/customer/referral-code": {
				get: {
					operationId: "getReferralCode",
					summary: "This shopper's referral code and what it has earned",
					description:
						"Null until they have one. Totals move only when a referred order is PAID, not when it is placed.",
					responses: {
						"200": { description: "The code with its totals, or null." },
						"401": { description: "Sign in first." },
					},
				},
				post: {
					operationId: "issueReferralCode",
					summary: "Create this shopper's referral code",
					description:
						"Idempotent — asking twice returns the same code, because a second one would break every link already shared. Random rather than derived from a name: a predictable code lets anyone attribute referrals to a stranger, and a name-based one leaks who the customer is to whoever receives the link. Requires a client record, so a customer who has never ordered gets a 404 explaining why.",
					responses: {
						"200": { description: "The code and its totals." },
						"404": {
							description: "No client record yet — place an order first.",
						},
					},
				},
			},
			"/v1/customer/wishlist": {
				get: {
					operationId: "listWishlist",
					summary: "The items this shopper saved",
					description:
						"Requires a customer session. Returns enough of each item to render a card — a wishlist page would otherwise be one request per saved item, from a browser. Withdrawn items are kept and labelled rather than hidden, so a shopper sees that something is gone instead of finding their list quietly shorter.",
					responses: {
						"200": { description: "Saved items, newest first." },
						"401": { description: "Sign in to view a wishlist." },
					},
				},
				post: {
					operationId: "addToWishlist",
					summary: "Save an item",
					description:
						"Idempotent — tapping a heart twice is one entry. Saving the same item with a different option updates the option rather than being ignored.",
					responses: {
						"201": { description: "Saved." },
						"404": {
							description:
								"The item is unavailable. Answered identically whether it is missing, withdrawn, or another shop's, so this cannot be used to probe a competitor's catalog.",
						},
					},
				},
			},
			"/v1/customer/wishlist/merge": {
				post: {
					operationId: "mergeWishlist",
					summary: "Fold a guest's saved items into their account",
					description:
						"Called once after sign-in. Additive, never replacing: somebody with five items saved on another device who saved three while signed out ends with eight. Unknown or withdrawn items are skipped rather than failing the whole merge, because a list carried in a browser for months will always contain one dead id.",
					responses: {
						"200": { description: "How many merged and how many skipped." },
						"401": { description: "Sign in first." },
					},
				},
			},
			"/v1/customer/wishlist/{catalogItemId}": {
				parameters: [
					{
						in: "path",
						name: "catalogItemId",
						required: true,
						schema: { type: "string", format: "uuid" },
					},
				],
				delete: {
					operationId: "removeFromWishlist",
					summary: "Remove a saved item",
					description:
						"Removing something absent is success. A double-tapped heart must not produce an error a shopper has to understand.",
					responses: {
						"200": { description: "Removed." },
						"401": { description: "Sign in first." },
					},
				},
			},
			"/v1/customer/auth/request-link": {
				post: {
					operationId: "requestCustomerSignInLink",
					summary: "Email a sign-in link to a customer",
					description:
						"Always answers 202, whether or not the address is known. Any observable difference would turn a public sign-in form into an oracle for whether somebody is a customer of that business.",
					responses: {
						"202": { description: "Accepted. A link is sent if applicable." },
					},
				},
			},
			"/v1/customer/auth/verify": {
				post: {
					operationId: "verifyCustomerSignInLink",
					summary: "Exchange a sign-in link for a session",
					description:
						"Single use. The session token is returned in the body rather than set as a cookie, so it works from a storefront on any domain and carries no CSRF surface. Expired, used, unknown and wrong-workspace tokens are answered identically.",
					responses: {
						"200": { description: "A session token and its expiry." },
						"401": { description: "The link is no longer valid." },
					},
				},
			},
			"/v1/customer/auth/me": {
				get: {
					operationId: "getCustomer",
					summary: "Who the presented customer session belongs to",
					responses: {
						"200": { description: "The customer's workspace-scoped id." },
						"401": { description: "No valid session." },
					},
				},
			},
			"/v1/customer/auth/sign-out": {
				post: {
					operationId: "signOutCustomer",
					summary: "Revoke a customer session",
					description: "Idempotent. An already-revoked token answers the same.",
					responses: { "200": { description: "Signed out." } },
				},
			},
			"/v1/customer/portal-handoff": {
				post: {
					operationId: "requestPortalHandoff",
					summary: "Get a one-use ticket to the hosted portal",
					description:
						"Lets a storefront send a signed-in shopper to the portal without a second sign-in, WITHOUT moving the session token across origins. Returns a separate ticket that lives for seconds and works once. Never put a session token in a redirect, a shared-parent-domain cookie, or a postMessage: one credential in two places means a leak on either compromises both, and signing out of one cannot revoke the other.",
					responses: {
						"200": {
							description: "A single-use handoff token and its expiry.",
						},
						"401": { description: "No valid session." },
					},
				},
			},
			"/v1/customer/portal-handoff/redeem": {
				post: {
					operationId: "redeemPortalHandoff",
					summary: "Trade a handoff ticket for a portal session",
					description:
						"Called by the portal with its own publishable key and no session. The session returned is independent of the storefront's, so signing out of either leaves the other alone. The ticket's workspace must match the presented key's, otherwise a ticket minted on one business's storefront could open a session at another's portal. Expired, spent, unknown and wrong-workspace tickets are answered identically.",
					responses: {
						"200": { description: "A session token and its expiry." },
						"401": { description: "The handoff is no longer valid." },
					},
				},
			},

			// A customer's own records. No client id is accepted on any of these —
			// the filter comes from the session, so there is no parameter a caller
			// could point at somebody else. Each is gated on its module, so a shop
			// has no bookings endpoint rather than an empty one.
			"/v1/customer/orders": {
				get: {
					operationId: "listCustomerOrders",
					summary: "The signed-in customer's own orders",
					responses: {
						"200": { description: "A page of the caller's orders." },
						"401": { description: "No valid session." },
						"403": { description: "Orders is not enabled." },
					},
				},
			},
			"/v1/customer/orders/{id}": {
				get: {
					operationId: "getCustomerOrder",
					summary: "One order owned by the signed-in customer",
					description:
						"Returns line items, totals, delivery address, payment state and shipment tracking. An order owned by another customer is indistinguishable from a missing order.",
					parameters: [
						{
							in: "path",
							name: "id",
							required: true,
							schema: { type: "string", format: "uuid" },
						},
					],
					responses: {
						"200": { description: "The caller's complete order detail." },
						"401": { description: "No valid customer session." },
						"404": { description: "The order was not found." },
					},
				},
			},
			"/v1/customer/bookings": {
				get: {
					operationId: "listCustomerBookings",
					summary: "The signed-in customer's own bookings",
					responses: {
						"200": { description: "A page of the caller's bookings." },
						"401": { description: "No valid session." },
						"403": { description: "Bookings is not enabled." },
					},
				},
			},
			"/v1/customer/invoices": {
				get: {
					operationId: "listCustomerInvoices",
					summary: "The signed-in customer's own invoices",
					responses: {
						"200": { description: "A page of the caller's invoices." },
						"401": { description: "No valid session." },
						"403": { description: "Invoicing is not enabled." },
					},
				},
			},
			"/v1/customer/messages": {
				get: {
					operationId: "listCustomerConversations",
					summary: "The signed-in customer's portal conversations",
					responses: {
						"200": { description: "Conversations newest first." },
						"401": { description: "Sign in first." },
					},
				},
				post: {
					operationId: "createCustomerConversation",
					summary: "Start or continue a conversation with the business",
					responses: {
						"201": { description: "The conversation." },
						"401": { description: "Sign in first." },
					},
				},
			},
			"/v1/customer/messages/{id}": {
				get: {
					operationId: "getCustomerConversation",
					summary: "One customer-owned conversation and its messages",
					responses: {
						"200": { description: "The conversation." },
						"404": { description: "Not found in this customer account." },
					},
				},
			},
			"/v1/customer/messages/{id}/replies": {
				post: {
					operationId: "replyToCustomerConversation",
					summary: "Reply to the business",
					responses: {
						"201": { description: "The reply." },
						"404": { description: "Conversation not found." },
					},
				},
			},
			"/v1/customer/messages/{id}/read": {
				post: {
					operationId: "markCustomerConversationRead",
					summary: "Mark the business's messages read",
					responses: {
						"200": { description: "Marked read." },
						"404": { description: "Conversation not found." },
					},
				},
			},
			"/v1/customer-conversations": {
				get: {
					operationId: "listOperatorCustomerConversations",
					summary: "Customer conversations for this workspace",
					responses: { "200": { description: "Conversations newest first." } },
				},
				post: {
					operationId: "createOperatorCustomerConversation",
					summary: "Message a customer with portal access",
					responses: {
						"201": { description: "The conversation." },
						"404": { description: "The customer has no portal membership." },
					},
				},
			},
			"/v1/customer-conversations/{id}": {
				get: {
					operationId: "getOperatorCustomerConversation",
					summary: "One workspace customer conversation",
					responses: {
						"200": { description: "The conversation and messages." },
						"404": { description: "Conversation not found." },
					},
				},
				patch: {
					operationId: "setCustomerConversationStatus",
					summary: "Open or close a customer conversation",
					responses: {
						"200": { description: "Updated conversation." },
						"404": { description: "Conversation not found." },
					},
				},
			},
			"/v1/customer-conversations/{id}/messages": {
				post: {
					operationId: "replyToOperatorCustomerConversation",
					summary: "Reply to a customer",
					responses: {
						"201": { description: "The reply." },
						"404": { description: "Conversation not found." },
					},
				},
			},
			"/v1/customer-conversations/{id}/read": {
				post: {
					operationId: "markOperatorCustomerConversationRead",
					summary: "Mark the customer's messages read",
					responses: {
						"200": { description: "Marked read." },
						"404": { description: "Conversation not found." },
					},
				},
			},

			// ── Credits ─────────────────────────────────────────────────────────
			"/v1/account/credits": {
				get: {
					operationId: "getCredits",
					summary: "Credit balance, packs and auto-recharge settings",
					responses: { "200": { description: "The organization's credits." } },
				},
			},
			"/v1/account/credits/top-up": {
				post: {
					operationId: "createCreditTopUp",
					summary: "Start a credit purchase",
					description:
						"Returns a Stripe client secret for Elements. Nothing is credited here — the balance moves when the charge succeeds and the webhook records it.",
					responses: {
						"201": { description: "A payment intent to complete." },
						"503": {
							description: "Payments unavailable. Nothing was charged.",
						},
					},
				},
			},
			"/v1/account/credits/auto-recharge": {
				put: {
					operationId: "setAutoRecharge",
					summary: "Turn auto-recharge on or off",
					description:
						"A standing authorisation to take payment, so enabling it requires both a trigger balance and an amount explicitly.",
					responses: { "200": { description: "The saved settings." } },
				},
			},

			// ── Account reads ───────────────────────────────────────────────────
			"/v1/account/revenue": {
				get: {
					operationId: "getOrganizationRevenue",
					summary: "Revenue across every workspace in the organization",
					description:
						"Reconciled to real payments. Reported per currency and never summed across them. A refund counts in the period it was refunded.",
					parameters: [
						{
							in: "query",
							name: "from",
							schema: { type: "string", format: "date-time" },
						},
						{
							in: "query",
							name: "to",
							schema: { type: "string", format: "date-time" },
						},
					],
					responses: { "200": { description: "Revenue for the range." } },
				},
			},
			"/v1/account/invitations/{token}": {
				get: {
					operationId: "getInvitation",
					summary: "Preview an invitation before accepting it",
					responses: { "200": { description: "The invitation." } },
				},
			},
			"/v1/account/workspaces/{id}/modules": {
				get: {
					operationId: "listWorkspaceModules",
					summary: "Which modules are enabled on a workspace",
					responses: { "200": { description: "The module list." } },
				},
			},

			// ── Billing information ─────────────────────────────────────────────
			"/v1/billing/plans": {
				get: {
					operationId: "listBillingPlans",
					summary: "The plan ladder as configured",
					description:
						"Public. Exposes whether a price is configured, never the price id.",
					responses: { "200": { description: "The plans." } },
				},
			},
			"/v1/billing/subscription": {
				get: {
					operationId: "getBillingSubscription",
					summary: "An organization's current subscription",
					description:
						"Answers `signedIn: false` rather than 401 when nobody is signed in, because both surfaces ask before they know.",
					parameters: [
						{ in: "query", name: "organizationId", schema: { type: "string" } },
					],
					responses: { "200": { description: "The subscription, or null." } },
				},
			},

			"/v1/activity": {
				get: {
					operationId: "listActivity",
					summary: "The workspace activity feed",
					description:
						"Without `since`, returns the newest events first — a fresh page load. With `since`, returns everything after that sequence oldest-first, which is how a client recovers events it missed while disconnected. `cursor` in the response is what to pass as the next `since`.",
					parameters: [
						{
							in: "query",
							name: "since",
							schema: { type: "integer", minimum: 0 },
							description:
								"Return events after this sequence number, oldest first.",
						},
						{
							in: "query",
							name: "limit",
							schema: { type: "integer", default: 50, maximum: 500 },
						},
					],
					responses: {
						"200": { description: "The events and the next cursor." },
						"400": { description: "`since` was not a non-negative integer." },
					},
				},
			},
			"/health": {
				get: {
					operationId: "getHealth",
					responses: { "200": { description: "The API process is alive." } },
				},
			},
			"/ready": {
				get: {
					operationId: "getReadiness",
					responses: {
						"200": {
							description:
								"Required dependencies are ready; optional checks may be degraded.",
						},
						"503": { description: "A required dependency is unavailable." },
					},
				},
			},
			"/version": {
				get: {
					operationId: "getVersion",
					responses: { "200": { description: "The deployed API version." } },
				},
			},
		},
	} as const;
}

/**
 * The served document: hand-written prose plus derived schemas.
 *
 * Split so the mechanical half cannot rot — see `openapi-augment.ts`.
 */
export function createOpenApiDocument(config: ApiConfig) {
	return augmentOpenApiDocument(declaredDocument(config));
}
