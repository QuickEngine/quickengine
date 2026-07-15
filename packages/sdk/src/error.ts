import type { QuickApiErrorBody } from "./types";

export class QuickApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly requestId: string | null;
	readonly details?: unknown;

	constructor(input: {
		code: string;
		message: string;
		status: number;
		requestId: string | null;
		details?: unknown;
	}) {
		super(input.message);
		this.name = "QuickApiError";
		this.code = input.code;
		this.status = input.status;
		this.requestId = input.requestId;
		this.details = input.details;
	}
}

export const readApiError = async (
	response: Response,
	requestId: string | null,
): Promise<QuickApiError> => {
	let body: QuickApiErrorBody | undefined;

	try {
		body = (await response.json()) as QuickApiErrorBody;
	} catch {
		body = undefined;
	}

	return new QuickApiError({
		code: body?.code ?? "quick_api_error",
		message: body?.message ?? response.statusText ?? "Quick.js request failed",
		status: response.status,
		requestId,
		details: body?.details,
	});
};
