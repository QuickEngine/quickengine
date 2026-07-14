"use server";

import { getSession } from "@quickengine/auth/server";
import { db, ensurePersonalOrg, eq } from "@quickengine/db";
import {
	quickengineUsers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { workspaceModules } from "@quickengine/db/schema/workspace-modules";
import { resolveFoundationModules } from "@quickengine/module-registry";
import { headers } from "next/headers";
import { nextAvailableSlug, slugify } from "../_lib/slug";

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
	const userId = session.user.id;

	const name = input.businessName.trim() || "My workspace";
	const foundation = resolveFoundationModules();

	// The workspace belongs to the user's personal org (idempotent — covers
	// existing users who predate the signup hook).
	const organizationId = await ensurePersonalOrg(
		userId,
		session.user.name ?? session.user.email,
	);

	// Workspace + module configuration + onboarding completion commit together. If
	// any registry row fails, no half-configured workspace survives.
	await db.transaction(async (tx) => {
		// Idempotent: a double-submit or replay cannot create another workspace.
		const [user] = await tx
			.select({ onboardingCompletedAt: quickengineUsers.onboardingCompletedAt })
			.from(quickengineUsers)
			.where(eq(quickengineUsers.id, userId))
			.limit(1);
		if (user?.onboardingCompletedAt) {
			return;
		}

		// A URL-safe slug, unique among this owner's workspaces (display names aren't).
		const owned = await tx
			.select({ slug: quickengineWorkspaces.slug })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.ownerId, userId));
		const taken = owned
			.map((workspace) => workspace.slug)
			.filter((slug): slug is string => slug !== null);
		const slug = nextAvailableSlug(slugify(name), taken);
		const canonicalModuleIds = foundation.map((module) => module.id);

		const [workspace] = await tx
			.insert(quickengineWorkspaces)
			.values({
				organizationId,
				ownerId: userId,
				name,
				slug,
				businessType: input.businessType,
				// Temporary compatibility mirror. The registry is the new source of truth.
				modules: canonicalModuleIds,
			})
			.returning({ id: quickengineWorkspaces.id });
		if (!workspace) {
			throw new Error("WORKSPACE_CREATE_FAILED");
		}

		await tx.insert(workspaceModules).values(
			foundation.map((module) => ({
				workspaceId: workspace.id,
				moduleId: module.id,
				enabled: true,
				settings: module.defaultSettings as Record<string, unknown>,
			})),
		);

		await tx
			.update(quickengineUsers)
			.set({ companyName: name, onboardingCompletedAt: new Date() })
			.where(eq(quickengineUsers.id, userId));
	});
}
