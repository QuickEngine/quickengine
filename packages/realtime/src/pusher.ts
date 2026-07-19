import Pusher from "pusher";
import type { RealtimeProvider } from "./index";

// The minimal server surface the provider needs, so it can be unit-tested against a
// fake without constructing a real Pusher client. Pusher's own `trigger` is compatible.
export type RealtimePublisher = {
	trigger(channel: string, event: string, data: unknown): Promise<unknown>;
};

// Process-wide server Pusher client, or null when the keys aren't configured (local
// dev / tests). Built lazily and memoized. `undefined` = not yet resolved.
let server: Pusher | null | undefined;

export function getPusherServer(): Pusher | null {
	if (server === undefined) {
		const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } =
			process.env;
		server =
			PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
				? new Pusher({
						appId: PUSHER_APP_ID,
						key: PUSHER_KEY,
						secret: PUSHER_SECRET,
						cluster: PUSHER_CLUSTER,
						useTLS: true,
					})
				: null;
	}
	return server;
}

// Publishes a realtime event by triggering it on its channel. The payload stays tiny
// (id + recordId) — the browser refetches authoritative state on receipt.
export function createPusherRealtimeProvider(
	client: RealtimePublisher,
): RealtimeProvider {
	return {
		async publish(event) {
			await client.trigger(event.channel, event.name, event.payload);
		},
	};
}

// Test seam: drop the memoized client so a test can re-resolve it after changing env.
export function resetPusherServerForTests(): void {
	server = undefined;
}
