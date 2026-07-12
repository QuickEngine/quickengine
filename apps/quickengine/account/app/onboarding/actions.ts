"use server";

import { getSession } from "@quickengine/auth/server";
import { db, eq } from "@quickengine/db";
import {
	quickengineUsers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";

// Persist the result of onboarding: create the first workspace, then stamp the
// user with the company name + onboarding-complete time (which flips the routing
// guard so they land in the app from here on).
export async function completeOnboarding(input: {
	businessName: string;
	businessType: string;
	modules: string[];
}) {
	const session = await getSession(await headers());
	if (!session) {
		throw new Error("UNAUTHENTICATED");
	}

	const userId = session.user.id;
	const name = input.businessName.trim() || "My workspace";

	await db.insert(quickengineWorkspaces).values({
		ownerId: userId,
		name,
		businessType: input.businessType,
		modules: input.modules,
	});

	await db
		.update(quickengineUsers)
		.set({ companyName: name, onboardingCompletedAt: new Date() })
		.where(eq(quickengineUsers.id, userId));
}
