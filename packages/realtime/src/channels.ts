export const WORKSPACE_CHANNEL_PREFIX = "private-workspace-";

export function workspaceChannel(workspaceId: string): string {
	return `${WORKSPACE_CHANNEL_PREFIX}${workspaceId}`;
}

export function parseWorkspaceChannel(channel: string): string | null {
	if (!channel.startsWith(WORKSPACE_CHANNEL_PREFIX)) return null;
	const workspaceId = channel.slice(WORKSPACE_CHANNEL_PREFIX.length);
	return workspaceId.length > 0 ? workspaceId : null;
}
