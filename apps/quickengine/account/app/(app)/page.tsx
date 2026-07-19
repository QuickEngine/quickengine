import { getSession } from "@quickengine/auth/server";
import { and, db, desc, eq, isNull, or } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveActiveOrg } from "../_lib/active-org";
import { WorkspacesToolbar } from "./workspaces-toolbar";

export const metadata: Metadata = { title: "Workspaces" };

// Workspaces is the account home — the first thing you land on, scoped to the active
// organization. The cross-workspace Overview lives at /overview.
export default async function Page() {
	const session = await getSession(await headers());
	if (!session) {
		return null; // The parent account layout owns the unauthenticated redirect.
	}

	const active = await resolveActiveOrg(session.user.id);
	if (!active) {
		return <WorkspacesToolbar workspaces={[]} />;
	}

	// Workspaces in the active org. On the personal org, also include any legacy workspaces the
	// user owns that predate the organizationId column (null org) so nothing disappears.
	const scope = active.isPersonal
		? or(
				eq(quickengineWorkspaces.organizationId, active.id),
				and(
					eq(quickengineWorkspaces.ownerId, session.user.id),
					isNull(quickengineWorkspaces.organizationId),
				),
			)
		: eq(quickengineWorkspaces.organizationId, active.id);

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
		.where(scope)
		.orderBy(desc(quickengineWorkspaces.createdAt));

	const workspaces = rows.map((workspace) => ({
		...workspace,
		archivedAt: workspace.archivedAt?.toISOString() ?? null,
		createdAt: workspace.createdAt.toISOString(),
	}));

	return <WorkspacesToolbar workspaces={workspaces} />;
}
