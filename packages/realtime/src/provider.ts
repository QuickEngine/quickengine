import { reportProviderSelection } from "@quickengine/provider-health";
import { createNoopRealtimeProvider, type RealtimeProvider } from "./index";
import { createPusherRealtimeProvider, getPusherServer } from "./pusher";

// The process-wide realtime provider. Pusher when the PUSHER_* keys are configured
// (staging/prod), otherwise the no-op provider so local dev and tests run offline.
// This is the single place provider selection lives — callers only ever see `publish`.
let provider: RealtimeProvider | undefined;

export function getRealtimeProvider(): RealtimeProvider {
	if (!provider) {
		const server = getPusherServer();
		if (server) {
			provider = createPusherRealtimeProvider(server);
			reportProviderSelection({ provider: "realtime", degraded: false });
		} else {
			provider = createNoopRealtimeProvider();
			// Nothing is lost — the database remains authoritative and clients refetch
			// on reconnect. What goes is live updating, so the UI silently stops
			// moving until someone reloads.
			reportProviderSelection({
				degraded: true,
				provider: "realtime",
				implementation: "no-op provider",
				consequence:
					"published events go nowhere, so live updates never reach any client",
				missing: ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET"],
				severity: "feature-loss",
			});
		}
	}
	return provider;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing env.
export function resetRealtimeProviderForTests(): void {
	provider = undefined;
}
