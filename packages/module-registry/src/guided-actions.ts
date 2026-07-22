import type { GuidedActionStepDescriptor } from "./first-actions";

export type SupplementalGuidedGoalDescriptor = {
	id: `${string}:${string}`;
	version: 1;
	label: string;
	description: string;
	surface: "account";
	intent: string;
	optional: true;
	steps: readonly GuidedActionStepDescriptor[];
};

/** Optional platform guidance stays outside the module dependency graph. */
export const accountSecurityGuidedGoal = {
	id: "account:security",
	version: 1,
	label: "Secure your account",
	description: "Review your sign-in protection when you are ready.",
	surface: "account",
	intent: "security",
	optional: true,
	steps: [
		{
			id: "account:security:review",
			version: 1,
			label: "Review Account security",
			description:
				"Check the sign-in methods and recovery options on your account.",
			intent: "security",
		},
		{
			id: "account:security:2fa",
			version: 1,
			label: "Enable two-factor authentication",
			description:
				"Add TOTP protection after onboarding if it fits your security needs.",
			intent: "two-factor",
			optional: true,
		},
	],
} as const satisfies SupplementalGuidedGoalDescriptor;
