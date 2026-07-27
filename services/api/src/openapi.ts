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
					summary:
						"Move a document between active, archived, trashed, and deleting",
					description:
						"A document must be trashed before it can be scheduled for deletion. Storage cleanup is queued only once the request commits.",
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
			"/v1/account/api-keys": {
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
			"/v1/account/workspaces": {
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
