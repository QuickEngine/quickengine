import { toOpenApiSchema } from "@quickengine/api-contracts";
import { apiMetaSchema } from "@quickengine/api-contracts/envelopes";
import { z } from "zod";
import { REQUEST_EXAMPLES } from "./openapi-examples";
import { REQUEST_SCHEMAS } from "./openapi-requests";
import { RESPONSE_SCHEMAS } from "./openapi-responses";

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

/**
 * Every success carries the same wrapper.
 *
 * `data` is deliberately left as an unconstrained object. The per-resource shapes
 * are NOT derived from the database tables, because a table carries fields the API
 * withholds on purpose — `webhook_endpoints.secret_ciphertext` and contract signing
 * tokens among them — and serialized timestamps are strings where the column is a
 * date. Publishing a shape we cannot guarantee would be worse than publishing none:
 * it would advertise a signing secret as part of the response.
 *
 * Per-resource response schemas are tracked as tech debt (item 14) for the
 * documentation sprint, where the DTO shapes get written down deliberately.
 */
const SUCCESS_CONTENT = {
	"application/json": {
		schema: { $ref: "#/components/schemas/SuccessEnvelope" },
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
	// Response shapes, proved against their DTO types at compile time in
	// `openapi-responses.ts` — so publishing them cannot contradict the API.
	for (const [operationId, schema] of Object.entries(RESPONSE_SCHEMAS)) {
		schemas[`${operationId}Response`] = toOpenApiSchema(schema);
	}
	// The wrapper every 2xx shares. `data` is an object whose shape depends on the
	// resource; see the note on SUCCESS_CONTENT.
	schemas.ApiMeta = toOpenApiSchema(apiMetaSchema);
	schemas.SuccessEnvelope = toOpenApiSchema(
		z.object({
			data: z
				.record(z.string(), z.unknown())
				.meta({ description: "The resource. Shape depends on the endpoint." }),
			meta: apiMetaSchema,
		}),
	);
	components.schemas = schemas;
	doc.components = components;

	const paths = (doc.paths ?? {}) as Record<string, Record<string, Operation>>;
	for (const item of Object.values(paths)) {
		for (const method of METHODS) {
			const operation = item[method];
			if (!operation?.operationId) continue;

			const schema = REQUEST_SCHEMAS[operation.operationId];
			if (schema && !operation.requestBody) {
				const example = REQUEST_EXAMPLES[operation.operationId];
				operation.requestBody = {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${operation.operationId}Request`,
							},
							// Validated against the schema by `openapi.test.ts`, so what
							// the docs show is something the API would actually accept.
							...(example === undefined ? {} : { example }),
						},
					},
				};
			}

			for (const [status, response] of Object.entries(
				operation.responses ?? {},
			)) {
				if (response.content) continue;
				// 4xx and 5xx always return the platform error envelope; 2xx always
				// returns the success envelope. Saying so once here beats repeating it
				// across 250-odd hand-written responses.
				if (/^[45]/.test(status)) {
					response.content = ERROR_CONTENT;
					continue;
				}
				if (!/^2/.test(status)) continue;

				// A documented resource shape where we have one; the bare envelope
				// otherwise, which never claims a shape it cannot guarantee.
				const responseSchema = RESPONSE_SCHEMAS[operation.operationId];
				response.content = responseSchema
					? {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: {
											$ref: `#/components/schemas/${operation.operationId}Response`,
										},
										meta: { $ref: "#/components/schemas/ApiMeta" },
									},
									required: ["data", "meta"],
								},
							},
						}
					: SUCCESS_CONTENT;
			}
		}
	}

	return doc as T;
}
