import {
	API_HEADERS,
	RATE_LIMIT_HEADERS,
} from "@quickengine/api-contracts/headers";
import type { MutationResult } from "@quickengine/api-contracts/mutations";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

export function respondMutation<TResult>(
	c: Context<PlatformEnv>,
	outcome: MutationResult<TResult>,
) {
	if (outcome.kind === "conflict") {
		return respondError(
			c,
			"IDEMPOTENCY_CONFLICT",
			"This idempotency key was already used with different input.",
			409,
		);
	}
	if (outcome.kind === "in_progress") {
		const response = respondError(
			c,
			"IDEMPOTENCY_IN_PROGRESS",
			"A matching request is still being processed.",
			409,
		);
		response.headers.set(
			RATE_LIMIT_HEADERS.retryAfter,
			String(outcome.retryAfterSeconds),
		);
		return response;
	}

	const response = respond(
		c,
		outcome.result,
		outcome.status as ContentfulStatusCode,
	);
	if (outcome.source === "replayed") {
		response.headers.set(API_HEADERS.idempotencyReplayed, "true");
	}
	return response;
}
