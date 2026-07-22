import { z } from "zod";

export type OpenApiSchema = Record<string, unknown>;

/** OpenAPI 3.1 consumes JSON Schema 2020-12 directly. */
export function toOpenApiSchema(schema: z.ZodType): OpenApiSchema {
	return z.toJSONSchema(schema, {
		target: "draft-2020-12",
		unrepresentable: "any",
	}) as OpenApiSchema;
}
