import { db, eq } from "@quickengine/db";
import { quickengineUsers } from "@quickengine/db/schema/quickengine";

export type AccountState = {
	companyName: string | null;
	onboardingCompletedAt: Date | null;
};

// Fresh read of the account fields the shell needs — company name for the header,
// onboarding flag for routing. Reads the DB directly rather than trusting the
// session cookie cache, which can lag by minutes right after onboarding (so the
// header would otherwise show the old name and the gate could loop).
export async function getAccountState(userId: string): Promise<AccountState> {
	const [row] = await db
		.select({
			companyName: quickengineUsers.companyName,
			onboardingCompletedAt: quickengineUsers.onboardingCompletedAt,
		})
		.from(quickengineUsers)
		.where(eq(quickengineUsers.id, userId))
		.limit(1);
	return {
		companyName: row?.companyName ?? null,
		onboardingCompletedAt: row?.onboardingCompletedAt ?? null,
	};
}
