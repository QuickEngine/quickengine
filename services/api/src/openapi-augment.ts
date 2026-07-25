import { toOpenApiSchema } from "@quickengine/api-contracts";
import { REQUEST_SCHEMAS } from "./openapi-requests";

/**
 * Fills in the machine-readable half of the OpenAPI document.
 *
 * The paths are declared by hand because summaries and descriptions are prose
 * worth writing. Everything mechanical — request body shapes, the error envelope
 * on every failure response — is derived here instead, from the Zod schemas the
 * routes already validate with. A document that restates its schemas by hand goes
 * stale silently; one that derives them cannot disagree with the running code.
 */

type Operation = Record<string, unknown> & {
	operationId?: string;
	requestBody?: unknown;
	responses?: Record<string, Record<string, unknown>>;
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** A failure response carries the standard envelope, whatever produced it. */
const ERROR_CONTENT = {
	"application/json": {
		schema: { $ref: "#/components/schemas/ErrorEnvelope" },
	},
};

export function augmentOpenApiDocument<T extends Record<string, unknown>>(
	document: T,
): T {
	// The declared document is deeply readonly (`as const`), so work on a copy
	// rather than fighting the type or mutating a shared object.
	const doc = structuredClone(document) as Record<string, unknown>;

	const components = (doc.components ?? {}) as Record<string, unknown>;
	const schemas = (components.schemas ?? {}) as Record<string, unknown>;

	// One component per request schema, referenced by the operations that use it,
	// so a shape shared by create and update appears once.
	for (const [operationId, schema] of Object.entries(REQUEST_SCHEMAS)) {
		schemas[`${operationId}Request`] = toOpenApiSchema(schema);
	}
	components.schemas = schemas;
	doc.components = components;

	const paths = (doc.paths ?? {}) as Record<string, Record<string, Operation>>;
	for (const item of Object.values(paths)) {
		for (const method of METHODS) {
			const operation = item[method];
			if (!operation?.operationId) continue;

			const schema = REQUEST_SCHEMAS[operation.operationId];
			if (schema && !operation.requestBody) {
				operation.requestBody = {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${operation.operationId}Request`,
							},
						},
					},
				};
			}

			for (const [status, response] of Object.entries(
				operation.responses ?? {},
			)) {
				// 4xx and 5xx always return the platform envelope. Saying so once here
				// beats repeating it across 100-odd hand-written responses.
				if (!/^[45]/.test(status) || response.content) continue;
				response.content = ERROR_CONTENT;
			}
		}
	}

	return doc as T;
}
