import { getSession } from "@quickengine/auth/server";
import { and, db, desc, eq, isNotNull, or } from "@quickengine/db";
import {
	quickengineOrganizationMembers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { WorkspacesToolbar } from "./workspaces-toolbar";

export const metadata: Metadata = { title: "Workspaces" };

// Workspaces is the account home — the first thing you land on. The cross-workspace
// Overview lives at /overview.
export default async function Page() {
	const session = await getSession(await headers());
	if (!session) {
		return null; // The parent account layout owns the unauthenticated redirect.
	}

	// Show workspaces the user owns OR is an org member of. The left join matches at most one
	// membership row per workspace (unique per org+user), so no duplicates; the owner branch
	// covers legacy rows without an organization membership.
	const rows = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			modules: quickengineWorkspaces.modules,
			archivedAt: quickengineWorkspaces.archivedAt,
			createdAt: quickengineWorkspaces.createdAt,
		})
		.from(quickengineWorkspaces)
		.leftJoin(
			quickengineOrganizationMembers,
			and(
				eq(
					quickengineOrganizationMembers.organizationId,
					quickengineWorkspaces.organizationId,
				),
				eq(quickengineOrganizationMembers.userId, session.user.id),
			),
		)
		.where(
			or(
				eq(quickengineWorkspaces.ownerId, session.user.id),
				isNotNull(quickengineOrganizationMembers.userId),
			),
		)
		.orderBy(desc(quickengineWorkspaces.createdAt));

	const workspaces = rows.map((workspace) => ({
		...workspace,
		archivedAt: workspace.archivedAt?.toISOString() ?? null,
		createdAt: workspace.createdAt.toISOString(),
	}));

	return <WorkspacesToolbar workspaces={workspaces} />;
}
