"use client";

import PusherClient from "pusher-js";
import { useEffect, useRef } from "react";
import { workspaceChannel } from "./index";

// Public Pusher config is inlined at build time by Next. Absent in local dev (and any
// environment without the keys), in which case the hook is a no-op.
const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

// Pusher's own lifecycle events arrive on the same binding; ignore them so callers
// only ever hear about real domain events.
function isInternal(eventName: string): boolean {
	return (
		eventName.startsWith("pusher:") || eventName.startsWith("pusher_internal:")
	);
}

// Subscribe to a workspace's private realtime channel and run `onEvent` (with the
// domain-event name) whenever one arrives. Subscribing hits `/api/pusher/auth`, which
// gates access on workspace membership. The callback is held in a ref so re-renders
// don't tear down and rebuild the subscription.
export function useWorkspaceRealtime(
	workspaceId: string,
	onEvent: (eventName: string) => void,
): void {
	const handler = useRef(onEvent);
	handler.current = onEvent;

	useEffect(() => {
		if (!KEY || !CLUSTER || !workspaceId) return;

		const pusher = new PusherClient(KEY, {
			cluster: CLUSTER,
			authEndpoint: "/api/pusher/auth",
		});
		const name = workspaceChannel(workspaceId);
		const channel = pusher.subscribe(name);
		channel.bind_global((eventName: string) => {
			if (!isInternal(eventName)) handler.current(eventName);
		});

		return () => {
			pusher.unsubscribe(name);
			pusher.disconnect();
		};
	}, [workspaceId]);
}
