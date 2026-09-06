import PusherClient from "pusher-js";
import { describe, expect, it } from "vitest";
import { catalogChannel } from "../src/channels";
import { getRealtimeProvider } from "../src/provider";

/**
 * The storefront round trip: publish as the server, receive as a browser.
 *
 * 🔴 This is the assertion that could not be made from either side alone. The
 * handler's filtering has unit tests and the transport has its own, but nothing
 * proved a real subscriber on a PUBLIC channel actually receives what the
 * provider publishes to it. A public channel has different naming and
 * authorization rules from the private one the console uses, and getting that
 * wrong fails at subscribe time, in the browser, silently.
 *
 * ⚠️ Skipped without credentials, like the rest of the live suite.
 */
const live = Boolean(
	process.env.PUSHER_APP_ID &&
		process.env.PUSHER_KEY &&
		process.env.PUSHER_SECRET &&
		process.env.PUSHER_CLUSTER,
);

describe.skipIf(!live)("catalog channel, server to browser", () => {
	it("delivers a catalog change to a subscriber", async () => {
		const workspaceId = "00000000-0000-4000-8000-00000000ffff";
		const channelName = catalogChannel(workspaceId);
		const received: { name: string; recordId: string }[] = [];

		const client = new PusherClient(process.env.PUSHER_KEY as string, {
			cluster: process.env.PUSHER_CLUSTER as string,
		});
		const channel = client.subscribe(channelName);

		try {
			await new Promise<void>((resolve, reject) => {
				channel.bind("pusher:subscription_succeeded", () => resolve());
				channel.bind("pusher:subscription_error", () =>
					reject(new Error(`could not subscribe to ${channelName}`)),
				);
				setTimeout(() => reject(new Error("subscribe timed out")), 15000);
			});

			channel.bind_global((name: string, payload: unknown) => {
				if (name.startsWith("pusher:")) return;
				received.push({
					name,
					recordId: (payload as { recordId: string }).recordId,
				});
			});

			const recordId = crypto.randomUUID();
			await getRealtimeProvider().publish({
				channel: channelName,
				name: "catalog-item.updated",
				payload: { id: crypto.randomUUID(), recordId },
			});

			await expect
				.poll(() => received, { timeout: 15000 })
				.toEqual([{ name: "catalog-item.updated", recordId }]);
		} finally {
			client.disconnect();
		}
	}, 40000);
});
