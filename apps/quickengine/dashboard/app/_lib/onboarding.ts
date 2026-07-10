import { db, eq } from "@quickengine/db";
import { quickengineUsers } from "@quickengine/db/schema/quickengine";

// Whether the user has finished onboarding. Trusts the (cached) session value
// when it's set, but falls back to a fresh DB read when it's empty — so a user
// who *just* completed onboarding isn't bounced back by the stale 5-minute
// session cookie cache.
export async function hasOnboarded(
	userId: string,
	cached: Date | string | null | undefined,
): Promise<boolean> {
	if (cached) {
		return true;
	}
	const [row] = await db
		.select({ at: quickengineUsers.onboardingCompletedAt })
		.from(quickengineUsers)
		.where(eq(quickengineUsers.id, userId))
		.limit(1);
	return Boolean(row?.at);
}
