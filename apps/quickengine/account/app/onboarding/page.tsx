import { getSession } from "@quickengine/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildOnboardingCatalog } from "../_lib/module-catalog";
import { getAccountState } from "../_lib/onboarding";
import { OnboardingFlow } from "./flow";

export const metadata: Metadata = { title: "Get started" };

// Shell-free first-run onboarding (lives outside the (app) group, so no sidebar
// or header). Auth is enforced by the root layout; here we bounce users who have
// already finished onboarding back into the app so they can't re-run it.
export default async function Page() {
	const session = await getSession(await headers());
	const state = session ? await getAccountState(session.user.id) : null;
	if (state?.onboardingCompletedAt) {
		redirect("/");
	}
	// Resolved here, on the server: the module registry imports every module package and
	// their Drizzle schemas, none of which belongs in the browser bundle.
	return <OnboardingFlow catalog={buildOnboardingCatalog()} />;
}
