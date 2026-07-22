import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./envelopes";
import { API_ERROR_CODES } from "./errors";
import { idempotencyKeySchema } from "./mutations";
import { toOpenApiSchema } from "./openapi";
import { cursorPageQuerySchema } from "./query";

describe("API contracts", () => {
	it("bounds idempotency keys to safe opaque values", () => {
		expect(idempotencyKeySchema.parse("intent_01HV-example")).toBe(
			"intent_01HV-example",
		);
		expect(() => idempotencyKeySchema.parse("short")).toThrow();
		expect(() => idempotencyKeySchema.parse("unsafe value")).toThrow();
	});
	it("keeps stable error codes unique", () => {
		expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
	});

	it("validates success and error envelopes", () => {
		const success = successEnvelopeSchema(z.object({ id: z.string() }));
		expect(
			success.parse({ data: { id: "client_1" }, meta: { requestId: "req_1" } }),
		).toEqual({ data: { id: "client_1" }, meta: { requestId: "req_1" } });
		expect(
			errorEnvelopeSchema.safeParse({
				error: {
					code: "NOT_FOUND",
					message: "Missing",
					requestId: "req_1",
				},
			}).success,
		).toBe(true);
	});

	it("normalizes bounded cursor pagination", () => {
		expect(cursorPageQuerySchema.parse({ limit: "50" })).toEqual({
			direction: "asc",
			limit: 50,
		});
		expect(cursorPageQuerySchema.safeParse({ limit: "101" }).success).toBe(
			false,
		);
	});

	it("converts Zod contracts to OpenAPI 3.1-compatible JSON Schema", () => {
		const schema = toOpenApiSchema(z.object({ id: z.uuid() }));
		expect(schema).toMatchObject({
			type: "object",
			properties: { id: { type: "string", format: "uuid" } },
			required: ["id"],
		});
	});
});
