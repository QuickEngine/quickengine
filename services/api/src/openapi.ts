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
