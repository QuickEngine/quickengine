import { and, db, eq } from "@quickengine/db";
import {
	quickengineAccounts,
	quickengineUsers,
} from "@quickengine/db/schema/quickengine";

export type AccountState = {
	companyName: string | null;
	onboardingCompletedAt: Date | null;
	twoFactorEnabled: boolean;
	// True only when the user signed up with email + password (a "credential"
	// account). OAuth-only users never set a password, so we don't offer 2FA setup.
	hasPassword: boolean;
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
			twoFactorEnabled: quickengineUsers.twoFactorEnabled,
		})
		.from(quickengineUsers)
		.where(eq(quickengineUsers.id, userId))
		.limit(1);

	const [credential] = await db
		.select({ id: quickengineAccounts.id })
		.from(quickengineAccounts)
		.where(
			and(
				eq(quickengineAccounts.userId, userId),
				eq(quickengineAccounts.providerId, "credential"),
			),
		)
		.limit(1);

	return {
		companyName: row?.companyName ?? null,
		onboardingCompletedAt: row?.onboardingCompletedAt ?? null,
		twoFactorEnabled: row?.twoFactorEnabled ?? false,
		hasPassword: Boolean(credential),
	};
}
