"use server";

import { createAnthropicTextProvider } from "@quickengine/agent-providers";
import { getSession } from "@quickengine/auth/server";
import { getCacheProvider } from "@quickengine/cache";
import { serverEnv } from "@quickengine/env/server";
import { headers } from "next/headers";
import { createWorkspaceForUser } from "../_lib/workspaces";
import {
	ONBOARDING_DESCRIPTION_MAX_LENGTH,
	recommendOnboardingRecipe,
} from "./recommendation";

export type RecommendOnboardingResult =
	| {
			ok: true;
			recommendation: Awaited<ReturnType<typeof recommendOnboardingRecipe>>;
	  }
	| { ok: false; error: "invalid" | "rate_limited" | "unavailable" };

export async function recommendOnboarding(
	descriptionInput: string,
): Promise<RecommendOnboardingResult> {
	const session = await getSession(await headers());
	if (!session) throw new Error("UNAUTHENTICATED");
	const description = descriptionInput.trim();
	if (
		description.length < 10 ||
		description.length > ONBOARDING_DESCRIPTION_MAX_LENGTH
	) {
		return { ok: false, error: "invalid" };
	}

	try {
		const cache = getCacheProvider();
		const [attempts, globalAttempts] = await Promise.all([
			cache.increment(`onboarding:recommend:${session.user.id}`, 60 * 60),
			cache.increment("onboarding:recommend:global", 24 * 60 * 60),
		]);
		if (attempts > 3) return { ok: false, error: "rate_limited" };
		if (globalAttempts > 500) return { ok: false, error: "unavailable" };
	} catch {
		// AI is optional, but unbounded paid calls are not. The preset/manual paths remain.
		return { ok: false, error: "unavailable" };
	}

	const provider = serverEnv.ANTHROPIC_API_KEY
		? createAnthropicTextProvider({
				apiKey: serverEnv.ANTHROPIC_API_KEY,
				model: serverEnv.ANTHROPIC_MODEL,
			})
		: undefined;
	return {
		ok: true,
		recommendation: await recommendOnboardingRecipe({ description, provider }),
	};
}

// Persist the result of onboarding: create the first workspace, then stamp the
// user with the company name + onboarding-complete time (which flips the routing
// guard so they land in the app from here on).
export async function completeOnboarding(input: {
	businessName: string;
	businessType: string;
	/** The modules chosen during onboarding. Validated and dependency-resolved server-side. */
	moduleIds?: readonly string[];
}) {
	const session = await getSession(await headers());
	if (!session) {
		throw new Error("UNAUTHENTICATED");
	}
	const workspace = await createWorkspaceForUser({
		userId: session.user.id,
		userLabel: session.user.name ?? session.user.email,
		name: input.businessName,
		businessType: input.businessType,
		moduleIds: input.moduleIds,
		completeOnboarding: true,
	});
	// null means onboarding had already completed (the idempotency guard inside the
	// transaction). Nothing was created, so there is no workspace to hand back.
	return workspace ? { workspaceId: workspace.id } : null;
}
