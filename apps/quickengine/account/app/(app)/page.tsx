import { getSession } from "@quickengine/auth/server";
import { db, desc, eq } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
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

	const rows = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			modules: quickengineWorkspaces.modules,
			createdAt: quickengineWorkspaces.createdAt,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.ownerId, session.user.id))
		.orderBy(desc(quickengineWorkspaces.createdAt));

	const workspaces = rows.map((workspace) => ({
		...workspace,
		createdAt: workspace.createdAt.toISOString(),
	}));

	return <WorkspacesToolbar workspaces={workspaces} />;
}
