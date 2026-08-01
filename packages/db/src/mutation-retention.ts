import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "./client";
import { apiMutations } from "./schema/api-platform";
import { mutationIdempotency } from "./schema/idempotency";

/**
 * How long a stored response can still be replayed.
 *
 * A client retrying a mutation does so within seconds, or minutes at the outside
 * after a dropped connection. Seven days is generous by an enormous margin and
 * short enough that customer records are not archived indefinitely by accident.
 */
export const RESPONSE_RETENTION_DAYS = 7;

/** Idempotency claims outlive the response they guarded; a month is ample. */
export const IDEMPOTENCY_RETENTION_DAYS = 30;

/**
 * Drop stored response bodies once they can no longer be replayed.
 *
 * 🔴 **Why this matters.** `api_mutations.response_body` holds the FULL response
 * of every durable mutation so an idempotent retry can return the same answer.
 * That is invoice contents, client details, order lines — real customer records,
 * kept forever, in a table with no expiry and no pruning job. `request-lookup.ts`
 * already refuses to serve the column, but refusing to serve is not the same as
 * not retaining.
 *
 * **The row is kept, only the body is cleared.** The mutation ledger is what
 * proves a write happened and who made it; deleting rows would destroy that.
 * Nulling the body keeps the evidence and drops the content, which is the whole
 * point.
 *
 * Bounded per run so a large backlog cannot hold the worker, and safe to repeat.
 */
export async function pruneStoredResponses(options?: {
	now?: Date;
	limit?: number;
}): Promise<{ responsesCleared: number; idempotencyRemoved: number }> {
	const now = options?.now ?? new Date();
	const limit = options?.limit ?? 1_000;

	// Select then update, rather than an UPDATE with a raw subselect. Postgres has
	// no LIMIT on UPDATE, and expressing the bound as inline SQL does not survive
	// the driver — the same problem the retention query hit. Two builder queries
	// are slower by one round trip and are actually debuggable.
	const responseCutoff = new Date(
		now.getTime() - RESPONSE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
	);
	const stale = await db
		.select({ id: apiMutations.id })
		.from(apiMutations)
		.where(
			and(
				lt(apiMutations.startedAt, responseCutoff),
				isNotNull(apiMutations.responseBody),
			),
		)
		.limit(limit);

	if (stale.length > 0) {
		await db
			.update(apiMutations)
			.set({ responseBody: null })
			.where(
				inArray(
					apiMutations.id,
					stale.map((row) => row.id),
				),
			);
	}

	const claimCutoff = new Date(
		now.getTime() - IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
	);
	const expired = await db
		.select({ key: mutationIdempotency.key })
		.from(mutationIdempotency)
		.where(lt(mutationIdempotency.createdAt, claimCutoff))
		.limit(limit);

	if (expired.length > 0) {
		await db.delete(mutationIdempotency).where(
			inArray(
				mutationIdempotency.key,
				expired.map((row) => row.key),
			),
		);
	}

	return {
		responsesCleared: stale.length,
		idempotencyRemoved: expired.length,
	};
}
