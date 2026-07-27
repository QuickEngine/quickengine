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

// One source of truth for publisher, authorizer, and browser subscriber. It lives
// in a server-free module so importing the browser hook cannot pull `pusher`
// (Node crypto) into a Vite bundle.
export {
	parseWorkspaceChannel,
	WORKSPACE_CHANNEL_PREFIX,
	workspaceChannel,
} from "./channels";

export { getRealtimeProvider, resetRealtimeProviderForTests } from "./provider";
// Server Pusher client, the provider that publishes through it, and the env-based
// selector. Kept below the shared types so the runtime re-export cycle resolves cleanly.
export {
	createPusherRealtimeProvider,
	getPusherServer,
	type RealtimePublisher,
	resetPusherServerForTests,
} from "./pusher";
