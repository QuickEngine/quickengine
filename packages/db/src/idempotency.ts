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
