import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { mutationIdempotency } from "./schema/idempotency";

// Atomically claim an idempotency key. Returns true if THIS caller claimed it (do the work),
// false if it was already claimed (a duplicate/replay — skip the work). The INSERT … ON
// CONFLICT DO NOTHING makes this race-safe: with two concurrent claims of the same key, exactly
// one insert succeeds. An empty/absent key claims nothing and returns true (idempotency opted out).
export async function claimIdempotencyKey(
	key: string | undefined | null,
	scope: string,
): Promise<boolean> {
	if (!key) return true;
	const inserted = await db
		.insert(mutationIdempotency)
		.values({ key, scope })
		.onConflictDoNothing({ target: mutationIdempotency.key })
		.returning({ key: mutationIdempotency.key });
	return inserted.length > 0;
}

// Release a previously claimed key so the caller can retry. A claim means "this caller is doing
// the work", not "the work happened" — if the work then fails, the key MUST be released, or the
// user's corrected retry carries the same key, loses the claim, and is silently treated as a
// duplicate no-op while nothing was ever created. Claim → do the work → commit or release.
export async function releaseIdempotencyKey(
	key: string | undefined | null,
	scope: string,
): Promise<void> {
	if (!key) return;
	await db
		.delete(mutationIdempotency)
		.where(
			and(
				eq(mutationIdempotency.key, key),
				eq(mutationIdempotency.scope, scope),
			),
		);
}
