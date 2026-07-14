"use server";

import { getSession } from "@quickengine/auth/server";
import { headers } from "next/headers";
import { createWorkspaceForUser } from "../_lib/workspaces";

// Persist the result of onboarding: create the first workspace, then stamp the
// user with the company name + onboarding-complete time (which flips the routing
// guard so they land in the app from here on).
export async function completeOnboarding(input: {
	businessName: string;
	businessType: string;
}) {
	const session = await getSession(await headers());
	if (!session) {
		throw new Error("UNAUTHENTICATED");
	}
	await createWorkspaceForUser({
		userId: session.user.id,
		userLabel: session.user.name ?? session.user.email,
		name: input.businessName,
		businessType: input.businessType,
		completeOnboarding: true,
	});
}
