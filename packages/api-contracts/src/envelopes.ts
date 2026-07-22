import { z } from "zod";
import { apiErrorSchema } from "./errors";

export const apiMetaSchema = z.object({
	requestId: z.string().min(1),
});

export function successEnvelopeSchema<T extends z.ZodType>(data: T) {
	return z.object({
		data,
		meta: apiMetaSchema,
	});
}

export const errorEnvelopeSchema = z.object({ error: apiErrorSchema });

export type ApiSuccessEnvelope<T> = {
	data: T;
	meta: z.infer<typeof apiMetaSchema>;
};

export type ApiErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
