import { createNoopRealtimeProvider, type RealtimeProvider } from "./index";
import { createPusherRealtimeProvider, getPusherServer } from "./pusher";

// The process-wide realtime provider. Pusher when the PUSHER_* keys are configured
// (staging/prod), otherwise the no-op provider so local dev and tests run offline.
// This is the single place provider selection lives — callers only ever see `publish`.
let provider: RealtimeProvider | undefined;

export function getRealtimeProvider(): RealtimeProvider {
	if (!provider) {
		const server = getPusherServer();
		provider = server
			? createPusherRealtimeProvider(server)
			: createNoopRealtimeProvider();
	}
	return provider;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing env.
export function resetRealtimeProviderForTests(): void {
	provider = undefined;
}
