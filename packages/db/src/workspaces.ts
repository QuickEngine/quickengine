import { and, asc, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "./client";
import { ensurePersonalOrg } from "./orgs";
import { orders } from "./schema/orders";
import { paymentAccounts, payments } from "./schema/payments";
import {
	quickengineOrganizationMembers,
	quickengineUsers,
	quickengineWorkspaces,
} from "./schema/quickengine";
import { workspaceModules } from "./schema/workspace-modules";
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
	 * The modules to enable, **already validated and dependency-resolved by the
	 * caller**, each with the default settings the registry defines for it.
	 *
	 * This layer stores them; it does not decide which imply which. The registry
	 * depends on this package, so it cannot be imported here — and that constraint
	 * happens to match the right layering.
	 */
	modules?: readonly { id: string; defaultSettings?: unknown }[];
	/** Only the first-workspace onboarding path may set this. */
	completeOnboarding?: boolean;
	/** The org to create the workspace in. Defaults to the user's personal org (onboarding). */
	organizationId?: string;
	environment?: WorkspaceEnvironment;
};

export type WorkspaceEnvironment = "test" | "live";

export type CreatedWorkspace = {
	id: string;
	name: string;
	slug: string;
	businessType: string;
	environment: WorkspaceEnvironment;
	moduleIds: readonly string[];
	/**
	 * The organization this landed in.
	 *
	 * Returned because it is not always the one the caller asked for: onboarding
	 * omits it and the personal org is resolved here. A caller that assumed its
	 * own organization would count the workspace against the wrong account.
	 */
	organizationId: string;
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
	const selected = input.modules ?? [];
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
				environment: input.environment ?? "live",
				// Temporary compatibility mirror; registry rows are canonical.
				modules: moduleIds,
			})
			.returning({
				id: quickengineWorkspaces.id,
				name: quickengineWorkspaces.name,
				slug: quickengineWorkspaces.slug,
				businessType: quickengineWorkspaces.businessType,
				environment: quickengineWorkspaces.environment,
			});
		if (!workspace?.slug) {
			throw new Error("WORKSPACE_CREATE_FAILED");
		}

		await tx.insert(workspaceModules).values(
			selected.map((module) => ({
				workspaceId: workspace.id,
				moduleId: module.id,
				enabled: true,
				settings: (module.defaultSettings ?? {}) as Record<string, unknown>,
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
			environment: workspace.environment,
			moduleIds,
			organizationId,
		};
	});
}

/**
 * Change a pristine workspace between test and live operation.
 *
 * A workspace that has entered the money lifecycle is deliberately immutable:
 * promoting it would relabel test orders or provider records as real business
 * history. Going live means creating a separate live workspace instead.
 */
export async function setWorkspaceEnvironment(
	workspaceId: string,
	environment: WorkspaceEnvironment,
) {
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({
				id: quickengineWorkspaces.id,
				environment: quickengineWorkspaces.environment,
			})
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) return null;
		if (workspace.environment === environment) return workspace;

		const [account, order, payment] = await Promise.all([
			tx
				.select({ id: paymentAccounts.id })
				.from(paymentAccounts)
				.where(eq(paymentAccounts.workspaceId, workspaceId))
				.limit(1),
			tx
				.select({ id: orders.id })
				.from(orders)
				.where(eq(orders.workspaceId, workspaceId))
				.limit(1),
			tx
				.select({ id: payments.id })
				.from(payments)
				.where(eq(payments.workspaceId, workspaceId))
				.limit(1),
		]);
		if (account.length > 0 || order.length > 0 || payment.length > 0) {
			throw new Error("WORKSPACE_ENVIRONMENT_LOCKED");
		}

		const [updated] = await tx
			.update(quickengineWorkspaces)
			.set({ environment, updatedAt: new Date() })
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.returning({
				id: quickengineWorkspaces.id,
				environment: quickengineWorkspaces.environment,
			});
		return updated ?? null;
	});
}

/**
 * Rename a workspace.
 *
 * The name is normalised here rather than at the call site so every entry point —
 * API, CLI, a future native client — enforces the same rules. Throws
 * `WORKSPACE_NAME_TOO_LONG` or `WORKSPACE_NAME_REQUIRED`, which callers map to
 * their own error shape.
 */
export async function renameWorkspace(workspaceId: string, name: string) {
	const normalized = normalizeWorkspaceName(name);
	const [workspace] = await db
		.update(quickengineWorkspaces)
		.set({ name: normalized, updatedAt: new Date() })
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.returning();
	return workspace;
}

/**
 * Archive or restore a workspace.
 *
 * Archiving is reversible and keeps every record — it only takes the workspace
 * out of the active list. That is the difference between this and deletion, and
 * it is why the UI should offer it first.
 */
export async function setWorkspaceArchived(
	workspaceId: string,
	archived: boolean,
) {
	const [workspace] = await db
		.update(quickengineWorkspaces)
		.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.returning();
	return workspace;
}

/** Permanently delete a workspace and everything cascading from it. */
export async function deleteWorkspace(workspaceId: string) {
	const [workspace] = await db
		.delete(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.returning();
	return workspace;
}

/**
 * Enable or disable a module on a workspace.
 *
 * Enabling resolves dependencies through the registry, so switching on a module
 * that composes on another brings its prerequisite with it — otherwise a
 * workspace ends up in a configuration that cannot work and says nothing about
 * why.
 */
export async function setWorkspaceModuleEnabled(input: {
	workspaceId: string;
	moduleId: string;
	enabled: boolean;
	/** The module plus its dependencies, resolved by the caller. */
	resolvedModuleIds?: readonly string[];
}) {
	if (!input.enabled) {
		await db
			.delete(workspaceModules)
			.where(
				and(
					eq(workspaceModules.workspaceId, input.workspaceId),
					eq(workspaceModules.moduleId, input.moduleId),
				),
			);
		return;
	}

	// Re-enabling an already-enabled module is a no-op rather than an error — the
	// caller should not have to check first.
	for (const moduleId of input.resolvedModuleIds ?? [input.moduleId]) {
		await db
			.insert(workspaceModules)
			.values({ workspaceId: input.workspaceId, moduleId })
			.onConflictDoNothing();
	}
}

/**
 * Every workspace in an organization, newest first.
 *
 * Archived ones are included with their `archivedAt` set, so a caller can show
 * them greyed rather than having them silently vanish — the account console
 * needs to offer restore, which is impossible if the list hides them.
 */
export async function listWorkspacesForOrganization(organizationId: string) {
	return db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			environment: quickengineWorkspaces.environment,
			modules: quickengineWorkspaces.modules,
			archivedAt: quickengineWorkspaces.archivedAt,
			createdAt: quickengineWorkspaces.createdAt,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.organizationId, organizationId))
		.orderBy(desc(quickengineWorkspaces.createdAt));
}

/**
 * Every active workspace a user may open in QuickDash, across all organizations.
 *
 * This is a product-shell read, not an account-management read: owners and
 * organization members see the same switcher regardless of which organization
 * happens to be selected in the Account app.
 */
export async function listAccessibleWorkspaces(userId: string) {
	return db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			environment: quickengineWorkspaces.environment,
			organizationId: quickengineWorkspaces.organizationId,
		})
		.from(quickengineWorkspaces)
		.leftJoin(
			quickengineOrganizationMembers,
			and(
				eq(
					quickengineOrganizationMembers.organizationId,
					quickengineWorkspaces.organizationId,
				),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.where(
			and(
				isNull(quickengineWorkspaces.archivedAt),
				or(
					eq(quickengineWorkspaces.ownerId, userId),
					isNotNull(quickengineOrganizationMembers.userId),
				),
			),
		)
		.orderBy(asc(quickengineWorkspaces.createdAt));
}

/** Proves a workspace belongs to an organization before an account-level write. */
export async function workspaceBelongsToOrganization(
	workspaceId: string,
	organizationId: string,
) {
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.organizationId, organizationId),
			),
		)
		.limit(1);
	return Boolean(workspace);
}
