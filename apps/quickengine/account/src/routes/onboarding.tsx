import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { redirect } from "@tanstack/react-router";
import { buildOnboardingCatalog } from "@/lib/module-catalog";
import { getAccountState } from "@/lib/onboarding";
import { OnboardingFlow } from "./flow";


// Shell-free first-run onboarding (lives outside the (app) group, so no sidebar
// or header). Auth is enforced by the root layout; here we bounce users who have
// already finished onboarding back into the app so they can't re-run it.
async function Page({
	searchParams,
}: {
	searchParams: Promise<{ prompt?: string }>;
}) {
	const params = await searchParams;
	const session = await getSession(await headers());
	const state = session ? await getAccountState(session.user.id) : null;
	if (state?.onboardingCompletedAt) {
		redirect("/");
	}
	// Resolved here, on the server: the module registry imports every module package and
	// their Drizzle schemas, none of which belongs in the browser bundle.
	return (
		<OnboardingFlow
			catalog={buildOnboardingCatalog()}
			initialDescription={params.prompt?.slice(0, 500) ?? ""}
		/>
	);
}

export const Route = createFileRoute("/onboarding")({
	component: Page,
});
