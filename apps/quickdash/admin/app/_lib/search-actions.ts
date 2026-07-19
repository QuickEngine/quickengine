"use server";

import { getSession } from "@quickengine/auth/server";
import { getSearchProvider } from "@quickengine/search";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type WorkspaceSearchHit = {
	objectID: string;
	title: string;
	description?: string;
	url?: string;
};

// The workspace search proxy — the multi-tenant SECURITY GATE. The `workspaceId` filter is
// derived server-side from a verified membership check (never a client-supplied filter), so
// a caller can only ever search records in a workspace they belong to.
export async function searchWorkspaceAction(
	workspaceId: string,
	query: string,
): Promise<WorkspaceSearchHit[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const session = await getSession(await headers());
	if (!session) return [];

	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) return [];

	const results = await getSearchProvider().search({
		index: "quickdash",
		query: trimmed,
		limit: 8,
		filters: { workspaceId },
	});

	return results.map((result) => ({
		objectID: result.objectID,
		title: result.title,
		description: result.description,
		url: result.url,
	}));
}
