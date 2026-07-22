import type { ApiConfig } from "./config";

export function createOpenApiDocument(config: ApiConfig) {
	return {
		openapi: "3.1.0",
		info: {
			title: "QuickEngine API",
			version: config.version,
			description: "The canonical API for QuickEngine and QuickDash.",
		},
		servers: [{ url: config.baseUrl }],
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
						"200": { description: "The API is ready to accept traffic." },
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
