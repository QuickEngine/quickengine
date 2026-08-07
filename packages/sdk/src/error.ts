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

	// 🔴 `body.error.code` FIRST. The API nests its failure envelope, and reading
	// only the flat field meant every error arrived as `quick_api_error` with the
	// real message replaced by `response.statusText`. Consumers branching on the
	// documented codes — `capability_denied`, `module_disabled`, `not_found` —
	// silently never matched, and a 403 for a missing capability was
	// indistinguishable from any other failure.
	const envelope = body?.error;
	return new QuickApiError({
		code: envelope?.code ?? body?.code ?? "quick_api_error",
		message:
			envelope?.message ??
			body?.message ??
			response.statusText ??
			"Quick.js request failed",
		status: response.status,
		// The envelope carries the id the API logged this under, which is the one
		// worth quoting in a support conversation. The header is the fallback.
		requestId: envelope?.requestId ?? requestId,
		details: envelope?.details ?? body?.details,
	});
};
