import {
	apiErrorSchema,
	errorEnvelopeSchema,
	successEnvelopeSchema,
	toOpenApiSchema,
} from "@quickengine/api-contracts";
import { z } from "zod";
import type { ApiConfig } from "./config";

export function createOpenApiDocument(config: ApiConfig) {
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
