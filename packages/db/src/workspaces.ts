import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
} from "drizzle-orm";
import { db } from "./client";
import { ensurePersonalOrg } from "./orgs";
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

		/**
		 * 🔴 The lock is gone, and this is why.
		 *
		 * Switching used to be refused once a workspace held a connected payment
		 * account, an order or a payment. The reasoning was sound — a rehearsal
		 * and a real sale must never share a ledger — but the remedy made sandbox
		 * a ONE-WAY DOOR: rehearse a single checkout, and that workspace could
		 * never take real money again. On a plan that includes one workspace, that
		 * meant deleting everything and starting over.
		 *
		 * Orders now carry the mode they were placed in, and payments always did,
		 * so the two are separable rather than merely forbidden: the console shows
		 * one mode at a time and a test order is invisible in live. Nothing mixes,
		 * so nothing needs blocking, and a business can rehearse and trade in the
		 * same workspace for as long as it likes.
		 *
		 * ⚠️ What this does NOT do is decide who can reach the shop. That is
		 * `published`, deliberately separate — see the column's own note.
		 */

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
	const rows = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			environment: quickengineWorkspaces.environment,
			archivedAt: quickengineWorkspaces.archivedAt,
			createdAt: quickengineWorkspaces.createdAt,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.organizationId, organizationId))
		.orderBy(desc(quickengineWorkspaces.createdAt));

	if (rows.length === 0) return [];

	/**
	 * 🔴 Modules come from `workspace_modules`, NOT from the workspace's own
	 * `modules` column.
	 *
	 * That column is written once, when the workspace is created, and never
	 * again — enabling and disabling only ever touch the join table. So it is a
	 * snapshot of the day the workspace was made, and every Account screen was
	 * reading it as current truth.
	 *
	 * The damage was not cosmetic. On the workspace page the toggles reflected
	 * the stale column, so switching a module off changed nothing on screen; a
	 * person reasonably concluded the control was broken and clicked again, and
	 * again, each click really disabling something. QuickDash, which reads the
	 * join table, then showed a sidebar with modules missing that nobody meant
	 * to turn off.
	 *
	 * ⚠️ Two queries and a merge, deliberately, rather than a grouped subquery:
	 * `DB_RULES.md` records that raw SQL subqueries do not survive the drizzle
	 * driver, and this path runs on every Account page load.
	 */
	const membership = await db
		.select({
			workspaceId: workspaceModules.workspaceId,
			moduleId: workspaceModules.moduleId,
		})
		.from(workspaceModules)
		.where(
			inArray(
				workspaceModules.workspaceId,
				rows.map((row) => row.id),
			),
		);

	const byWorkspace = new Map<string, string[]>();
	for (const row of membership) {
		const list = byWorkspace.get(row.workspaceId);
		if (list) list.push(row.moduleId);
		else byWorkspace.set(row.workspaceId, [row.moduleId]);
	}

	return rows.map((row) => ({
		...row,
		modules: byWorkspace.get(row.id) ?? [],
	}));
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

/**
 * Open or close the shop to the public.
 *
 * ⚠️ Nothing to do with `environment`. Closing does not change whether money is
 * real, and switching to test does not close the shop — a business can rehearse
 * with its doors shut, or take real orders while quietly on test credentials,
 * and those are two different mistakes to be able to make separately.
 */
export async function setWorkspacePublished(
	workspaceId: string,
	published: boolean,
) {
	const [row] = await db
		.update(quickengineWorkspaces)
		.set({ published, updatedAt: new Date() })
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.returning({
			id: quickengineWorkspaces.id,
			published: quickengineWorkspaces.published,
		});
	return row ?? null;
}
