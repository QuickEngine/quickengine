import { z } from "zod";

export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const cursorPageQuerySchema = z.object({
	cursor: z.string().trim().min(1).optional(),
	direction: sortDirectionSchema.default("asc"),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	sort: z.string().trim().min(1).optional(),
});

export const cursorPageMetaSchema = z.object({
	hasMore: z.boolean(),
	nextCursor: z.string().nullable(),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
export type CursorPageMeta = z.infer<typeof cursorPageMetaSchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
	return z.object({
		items: z.array(item),
		page: cursorPageMetaSchema,
	});
}
