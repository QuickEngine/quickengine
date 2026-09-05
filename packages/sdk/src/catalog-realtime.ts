import type { QuickClient } from "./client";

/**
 * Live catalog updates for any site connected to QuickDash.
 *
 * A storefront's visitors are strangers with no session, so they cannot
 * authorize the private channel the QuickDash console listens on. This
 * subscribes to the workspace's PUBLIC catalog channel instead, which carries
 * catalog and stock events only, and each one carries an id rather than any
 * detail. The site answers by refetching through the catalog API it already
 * uses, which returns published items only.
 *
 * That refetch is the point. The message is a hint that something changed, not
 * the data itself, so a site can never render something stale or something it
 * was not allowed to see.
 *
 * ⚠️ `pusher-js` is an OPTIONAL peer dependency. Quick.js has no runtime
 * dependencies of its own and that is worth keeping, so a site that wants live
 * updates installs the client itself and this loads it on demand. Sites that
 * never call this pay nothing for it.
 */
export type CatalogChange = {
	/** The event that fired, for example `catalog-item.updated`. */
	name: string;
	/** The record that changed. Refetch rather than trusting this alone. */
	recordId: string;
};

export type SubscribeToCatalogOptions = {
	/**
	 * Called when anything in the catalog changes. Debounce inside if a burst
	 * would cause a burst of refetches: a bulk stock import fires many events.
	 */
	onChange: (change: CatalogChange) => void;
	/**
	 * Called if live updates cannot start, so a site can decide what to do. The
	 * default is deliberately quiet: the page keeps working without realtime, it
	 * just stops updating on its own.
	 */
	onUnavailable?: (reason: string) => void;
};

/**
 * Only the corner of the Pusher client this uses, described structurally.
 *
 * ⚠️ Written out rather than imported on purpose. Quick.js is published with no
 * dependencies, so it cannot reach `pusher-js` types at build time even though
 * a site supplies the real thing at runtime.
 */
type PusherChannel = {
	bind_global: (handler: (name: string, payload: unknown) => void) => void;
	unbind_global: (handler: (name: string, payload: unknown) => void) => void;
};

type PusherInstance = {
	subscribe: (channel: string) => PusherChannel;
	unsubscribe: (channel: string) => void;
	disconnect: () => void;
};

type PusherConstructor = new (
	key: string,
	options: { cluster: string },
) => PusherInstance;

type CatalogRealtimeConfig = {
	key: string;
	cluster: string;
	channel: string;
};

/**
 * Starts listening, and returns the function that stops.
 *
 * Always returns a usable unsubscribe, including when realtime could not start,
 * so a caller never has to null-check it in a cleanup path.
 */
export async function subscribeToCatalog(
	client: QuickClient,
	options: SubscribeToCatalogOptions,
): Promise<() => void> {
	const unavailable = (reason: string) => {
		options.onUnavailable?.(reason);
		return () => {};
	};

	let config: CatalogRealtimeConfig;
	try {
		/**
		 * 🔴 No `/v1` here. The client prepends its own API version, so a path
		 * written with one becomes `/v1/v1/realtime/catalog`, 404s, and this
		 * function reports "unavailable" as though realtime were simply switched
		 * off. That shipped in 0.2.0 and cost an evening: every other link in the
		 * chain was verified working, because the fault was one segment long and
		 * degraded quietly by design.
		 */
		const response =
			await client.request<CatalogRealtimeConfig>("/realtime/catalog");
		config = response.data;
	} catch {
		// 503 when realtime has no provider configured, 403 when the key may not
		// read this catalog. Neither is worth breaking a storefront over.
		return unavailable("Live catalog updates are not available.");
	}

	let PusherClient: PusherConstructor;
	try {
		// Resolved at runtime by the site, never bundled: Quick.js does not depend
		// on `pusher-js` and must keep installing without it.
		// 🔴 The specifier is a variable so TypeScript does not try to resolve a
		// module this package deliberately does not have. A literal here fails the
		// SDK's own typecheck even though the import only ever runs in a site that
		// installed the client itself.
		const specifier = "pusher-js";
		const loaded = (await import(/* @vite-ignore */ specifier)) as {
			default: PusherConstructor;
		};
		PusherClient = loaded.default;
	} catch {
		return unavailable(
			"Live catalog updates need the `pusher-js` package installed alongside Quick.js.",
		);
	}

	const pusher = new PusherClient(config.key, { cluster: config.cluster });
	const channel = pusher.subscribe(config.channel);

	// Bound globally rather than per event name so a new catalog event added on
	// the server reaches sites that were built before it existed. The server
	// decides what may cross this channel; the site does not need to keep a list
	// in step with it.
	const handler = (name: string, payload: unknown) => {
		// Pusher's own lifecycle events share this channel and are not changes.
		if (name.startsWith("pusher:")) return;

		const recordId =
			typeof payload === "object" && payload !== null && "recordId" in payload
				? String((payload as { recordId: unknown }).recordId)
				: "";
		options.onChange({ name, recordId });
	};
	channel.bind_global(handler);

	return () => {
		channel.unbind_global(handler);
		pusher.unsubscribe(config.channel);
		pusher.disconnect();
	};
}
