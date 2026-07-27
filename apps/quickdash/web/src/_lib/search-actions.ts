import { workspaceApi } from "../lib/api";

export type WorkspaceSearchHit = {
	objectID: string;
	title: string;
	description?: string;
	url?: string;
};

export async function searchWorkspaceAction(
	workspaceId: string,
	query: string,
): Promise<WorkspaceSearchHit[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	return (
		await workspaceApi(workspaceId).request<{ items: WorkspaceSearchHit[] }>(
			`/quickdash/search?q=${encodeURIComponent(trimmed)}`,
		)
	).data.items;
}
