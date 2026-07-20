import { db, ensurePersonalOrg, eq } from "@quickengine/db";
import {
	quickengineUsers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { workspaceModules } from "@quickengine/db/schema/workspace-modules";
import {
	getModule,
	resolveFoundationModules,
	resolveModules,
} from "@quickengine/module-registry";
import { nextAvailableSlug, slugify } from "./slug";
import {
	normalizeBusinessType,
	normalizeWorkspaceName,
} from "./workspace-input";

export type CreateWorkspaceInput = {
	userId: string;
	userLabel: string;
	name: string;
	businessType: string;
	/**
	 * The modules the user actually chose. Unknown ids are ignored (never trust the
	 * client), and dependencies are resolved by the registry, so enabling a module that
	 * composes on another brings its prerequisite along. Omitted or empty falls back to
	 * the foundation set — the sensible default for a workspace created without a choice.
	 */
	moduleIds?: readonly string[];
	/** Only the first-workspace onboarding path may set this. */
	completeOnboarding?: boolean;
	/** The org to create the workspace in. Defaults to the user's personal org (onboarding). */
	organizationId?: string;
};

export type CreatedWorkspace = {
	id: string;
	name: string;
	slug: string;
	businessType: string;
	moduleIds: readonly string[];
};

/**
 * The one canonical workspace creation path. It serializes creation per user so
 * simultaneous requests cannot claim the same slug, and commits the workspace,
 * foundation registry, and optional onboarding stamp together.
 */
export async function createWorkspaceForUser(
	input: CreateWorkspaceInput,
): Promise<CreatedWorkspace | null> {
	const name = normalizeWorkspaceName(input.name);
	const businessType = normalizeBusinessType(input.businessType);
	// Drop ids the registry doesn't know before resolving — `resolveModules` throws on an
	// unknown id, and this input crosses a trust boundary from the browser.
	const requested = (input.moduleIds ?? []).filter((id) => getModule(id));
	const selected =
		requested.length > 0
			? resolveModules(requested)
			: resolveFoundationModules();
	const moduleIds = selected.map((module) => module.id);
	const organizationId =
		input.organizationId ??
		(await ensurePersonalOrg(input.userId, input.userLabel));

	return db.transaction(async (tx) => {
		// Lock the owning user: slug generation and first-workspace idempotency must
		// observe a stable view when two requests arrive together.
		const [user] = await tx
			.select({ onboardingCompletedAt: quickengineUsers.onboardingCompletedAt })
			.from(quickengineUsers)
			.where(eq(quickengineUsers.id, input.userId))
			.limit(1)
			.for("update");
		if (!user) {
			throw new Error("USER_NOT_FOUND");
		}
		if (input.completeOnboarding && user.onboardingCompletedAt) {
			return null;
		}

		const owned = await tx
			.select({ slug: quickengineWorkspaces.slug })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.ownerId, input.userId));
		const taken = owned
			.map((workspace) => workspace.slug)
			.filter((slug): slug is string => slug !== null);
		const slug = nextAvailableSlug(slugify(name), taken);

		const [workspace] = await tx
			.insert(quickengineWorkspaces)
			.values({
				organizationId,
				ownerId: input.userId,
				name,
				slug,
				businessType,
				// Temporary compatibility mirror; registry rows are canonical.
				modules: moduleIds,
			})
			.returning({
				id: quickengineWorkspaces.id,
				name: quickengineWorkspaces.name,
				slug: quickengineWorkspaces.slug,
				businessType: quickengineWorkspaces.businessType,
			});
		if (!workspace?.slug) {
			throw new Error("WORKSPACE_CREATE_FAILED");
		}

		await tx.insert(workspaceModules).values(
			selected.map((module) => ({
				workspaceId: workspace.id,
				moduleId: module.id,
				enabled: true,
				settings: module.defaultSettings as Record<string, unknown>,
			})),
		);

		if (input.completeOnboarding) {
			await tx
				.update(quickengineUsers)
				.set({ companyName: name, onboardingCompletedAt: new Date() })
				.where(eq(quickengineUsers.id, input.userId));
		}

		return {
			id: workspace.id,
			name: workspace.name,
			slug: workspace.slug,
			businessType: workspace.businessType,
			moduleIds,
		};
	});
}
