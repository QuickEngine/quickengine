export type RealtimeChannel = string;

export type RealtimeEvent<TPayload extends Record<string, unknown>> = {
	channel: RealtimeChannel;
	name: string;
	payload: TPayload;
};

export type RealtimeProvider = {
	publish<TPayload extends Record<string, unknown>>(
		event: RealtimeEvent<TPayload>,
	): Promise<void>;
};

export const createNoopRealtimeProvider = (): RealtimeProvider => ({
	async publish() {},
});

// One source of truth for the channel format, shared by the publisher (the event bus)
// and the authorizer (the Pusher auth endpoint) — they must agree exactly, since a
// mismatch would either break auth or, worse, misroute a subscription. Pusher's
// `private-` prefix marks channels that require the auth endpoint before subscribing.
export const WORKSPACE_CHANNEL_PREFIX = "private-workspace-";

export function workspaceChannel(workspaceId: string): string {
	return `${WORKSPACE_CHANNEL_PREFIX}${workspaceId}`;
}

// Inverse of workspaceChannel: pull the workspace id back out of a channel name, or
// null if it isn't a workspace channel. Used by the auth endpoint to know which
// workspace's membership to check.
export function parseWorkspaceChannel(channel: string): string | null {
	if (!channel.startsWith(WORKSPACE_CHANNEL_PREFIX)) return null;
	const workspaceId = channel.slice(WORKSPACE_CHANNEL_PREFIX.length);
	return workspaceId.length > 0 ? workspaceId : null;
}

export { getRealtimeProvider, resetRealtimeProviderForTests } from "./provider";
// Server Pusher client, the provider that publishes through it, and the env-based
// selector. Kept below the shared types so the runtime re-export cycle resolves cleanly.
export {
	createPusherRealtimeProvider,
	getPusherServer,
	type RealtimePublisher,
	resetPusherServerForTests,
} from "./pusher";
