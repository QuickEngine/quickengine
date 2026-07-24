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
