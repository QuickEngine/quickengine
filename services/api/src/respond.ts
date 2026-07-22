import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode = "INTERNAL_ERROR" | "NOT_FOUND";

export function respond<T>(
	c: Context,
	data: T,
	status: ContentfulStatusCode = 200,
) {
	return c.json(
		{
			data,
			meta: {
				requestId: c.get("requestId") as string,
			},
		},
		status,
	);
}

export function respondError(
	c: Context,
	code: ApiErrorCode,
	message: string,
	status: ContentfulStatusCode,
) {
	return c.json(
		{
			error: {
				code,
				message,
				requestId: c.get("requestId") as string,
			},
		},
		status,
	);
}
