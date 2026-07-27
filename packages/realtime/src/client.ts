"use client";

import PusherClient from "pusher-js";
import type { ChannelAuthorizationHandler } from "pusher-js/types/src/core/auth/options";
import { useEffect, useRef } from "react";
import { workspaceChannel } from "./channels";

// Public Pusher config is inlined at build time by Next. Absent in local dev (and any
// environment without the keys), in which case the hook is a no-op.
const clientEnv = (
	import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
const KEY = clientEnv.VITE_PUSHER_KEY;
const CLUSTER = clientEnv.VITE_PUSHER_CLUSTER;
// The API is its own deployment, so authorizing a subscription is a cross-origin
// call rather than a route inside this app.
const API_URL = clientEnv.VITE_API_URL ?? window.location.origin;

/**
 * Authorize a subscription against the QuickEngine API.
 *
 * pusher-js's built-in ajax transport is not usable here: it never sets
 * `withCredentials`, so cross-origin requests carry no session cookie and the API
 * would reject every subscription as unauthenticated. Supplying a `customHandler`
 * is the supported way to control the request, and `credentials: "include"` is the
 * whole reason this function exists.
 *
 * The API allows credentialed CORS from the first-party apps and requires a known
 * `Origin` on cookie-authenticated writes, so a third-party page cannot use this
 * endpoint even with a valid channel name.
 */
const authorizeChannel: ChannelAuthorizationHandler = async (
	params,
	callback,
) => {
	try {
		const response = await fetch(`${API_URL}/v1/realtime/auth`, {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				socket_id: params.socketId,
				channel_name: params.channelName,
			}),
		});
		if (!response.ok) {
			// A 403 here means the channel belongs to another workspace, which is the
			// tenant boundary doing its job — not a transient failure worth retrying.
			throw new Error(`realtime authorization failed (${response.status})`);
		}
		callback(null, await response.json());
	} catch (error) {
		callback(error instanceof Error ? error : new Error(String(error)), null);
	}
};

// Pusher's own lifecycle events arrive on the same binding; ignore them so callers
// only ever hear about real domain events.
function isInternal(eventName: string): boolean {
	return (
		eventName.startsWith("pusher:") || eventName.startsWith("pusher_internal:")
	);
}

export type WorkspaceRealtimeHandlers = {
	/** A domain event arrived. The name is the canonical `<entity>.<verb>`. */
	onEvent: (eventName: string) => void;
	/**
	 * The connection was re-established after being lost.
	 *
	 * **Events that occurred while disconnected were never delivered and never
	 * will be** — Pusher does not replay them. Use this to read
	 * `/v1/activity?since=<cursor>` and reconcile, or the UI silently drifts out of
	 * date until something unrelated happens to trigger a refetch.
	 */
	onReconnect?: () => void;
};

// Subscribe to a workspace's private realtime channel. Subscribing hits the realtime
// auth endpoint, which gates access on workspace membership — knowing a channel name
// grants nothing. Handlers are held in a ref so re-renders don't tear down and rebuild
// the subscription.
//
// Realtime is a *hint*, not the transport of record: the payload carries identity
// only and the client refetches authoritative state. That is precisely what makes
// `onReconnect` enough to recover — there is no missed payload to reconstruct, only a
// catch-up read to perform.
export function useWorkspaceRealtime(
	workspaceId: string,
	handlers: WorkspaceRealtimeHandlers | ((eventName: string) => void),
): void {
	// A bare callback is still accepted for the common case, so existing call sites
	// keep working unchanged.
	const ref = useRef<WorkspaceRealtimeHandlers>(
		typeof handlers === "function" ? { onEvent: handlers } : handlers,
	);
	ref.current =
		typeof handlers === "function" ? { onEvent: handlers } : handlers;

	useEffect(() => {
		if (!KEY || !CLUSTER || !workspaceId) return;

		const pusher = new PusherClient(KEY, {
			cluster: CLUSTER,
			channelAuthorization: {
				endpoint: `${API_URL}/v1/realtime/auth`,
				transport: "ajax",
				customHandler: authorizeChannel,
			},
		});
		const name = workspaceChannel(workspaceId);
		const channel = pusher.subscribe(name);
		channel.bind_global((eventName: string) => {
			if (!isInternal(eventName)) ref.current.onEvent(eventName);
		});

		// Fire only on a *re*-connection. The first connect leaves no gap to fill,
		// and treating it as a reconnect would make every page load refetch twice.
		let hasConnected = false;
		const onStateChange = (states: { current: string }) => {
			if (states.current !== "connected") return;
			if (hasConnected) ref.current.onReconnect?.();
			hasConnected = true;
		};
		pusher.connection.bind("state_change", onStateChange);

		return () => {
			pusher.connection.unbind("state_change", onStateChange);
			pusher.unsubscribe(name);
			pusher.disconnect();
		};
	}, [workspaceId]);
}
