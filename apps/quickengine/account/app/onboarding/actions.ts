"use server";

import { getSession } from "@quickengine/auth/server";
import { db, eq } from "@quickengine/db";
import {
	quickengineUsers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";
import { nextAvailableSlug, slugify } from "../_lib/slug";

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

	// Idempotent: if onboarding already finished, don't create a second workspace.
	// Guards against a double-submit or the action being re-run.
	const [user] = await db
		.select({ onboardingCompletedAt: quickengineUsers.onboardingCompletedAt })
		.from(quickengineUsers)
		.where(eq(quickengineUsers.id, userId))
		.limit(1);
	if (user?.onboardingCompletedAt) {
		return;
	}

	const name = input.businessName.trim() || "My workspace";

	// A URL-safe slug, unique among this owner's workspaces (display names aren't).
	const owned = await db
		.select({ slug: quickengineWorkspaces.slug })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.ownerId, userId));
	const taken = owned
		.map((workspace) => workspace.slug)
		.filter((slug): slug is string => slug !== null);
	const slug = nextAvailableSlug(slugify(name), taken);

	await db.insert(quickengineWorkspaces).values({
		ownerId: userId,
		name,
		slug,
		businessType: input.businessType,
		modules: input.modules,
	});

	await db
		.update(quickengineUsers)
		.set({ companyName: name, onboardingCompletedAt: new Date() })
		.where(eq(quickengineUsers.id, userId));
}
