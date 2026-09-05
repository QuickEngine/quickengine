import { describe, expect, it } from "vitest";
import { workspaceChannel } from "../src/channels";
import { getPusherServer, resetPusherServerForTests } from "../src/pusher";

/**
 * Proves the realtime transport against the REAL Pusher app.
 *
 * 🔴 Everything about realtime was built and none of it was ever exercised
 * together: `realtimeHandler` has been in `defaultOutboxHandlers` since the
 * outbox existed, `useWorkspaceRealtime` was written and never called, and the
 * console polled every sixty seconds instead. Each piece passed its own unit
 * test while the path between them had never carried a single event.
 *
 * ⚠️ Skipped without credentials, like `r2.live.test.ts`. CI has no Pusher app,
 * and a test that silently passes when it cannot reach the thing it is testing
 * is worse than one that says it was skipped.
 */
const env = {
	appId: process.env.PUSHER_APP_ID,
	key: process.env.PUSHER_KEY,
	secret: process.env.PUSHER_SECRET,
	cluster: process.env.PUSHER_CLUSTER,
};
const live = Object.values(env).every(Boolean);

describe.skipIf(!live)("pusher, against the real app", () => {
	it("reaches the app it is configured for", async () => {
		resetPusherServerForTests();
		const pusher = getPusherServer();
		expect(
			pusher,
			"PUSHER_* are set, so a server must be built",
		).not.toBeNull();

		// `/channels` is the cheapest authenticated call there is: it proves the
		// app id, key, secret and cluster all agree without publishing anything.
		const res = await pusher?.get({ path: "/channels" });
		expect(res?.status).toBe(200);
	});

	it("publishes to a workspace channel", async () => {
		resetPusherServerForTests();
		const pusher = getPusherServer();
		const workspaceId = "00000000-0000-4000-8000-00000000ffff";

		/**
		 * ⚠️ Publishing to a channel nobody is on is still a real assertion. Pusher
		 * answers 200 only when the credentials and the channel name are both
		 * acceptable, and a malformed private channel is refused — which is the
		 * failure this catches.
		 */
		const res = await pusher?.trigger(
			workspaceChannel(workspaceId),
			"test.ping",
			{
				id: "test",
			},
		);
		expect(res?.status).toBe(200);
	});

	it("authorizes a subscription to its own workspace and no other", () => {
		resetPusherServerForTests();
		const pusher = getPusherServer();
		const mine = workspaceChannel("11111111-1111-4111-8111-111111111111");

		const auth = pusher?.authorizeChannel("123.456", mine);
		expect(auth?.auth, "a private channel needs a signature").toMatch(/:/);

		// 🔑 The signature is bound to the channel NAME. The API decides which
		// workspace a caller may join; this only proves the token cannot be
		// replayed onto a different channel.
		const other = workspaceChannel("22222222-2222-4222-8222-222222222222");
		const otherAuth = pusher?.authorizeChannel("123.456", other);
		expect(otherAuth?.auth).not.toEqual(auth?.auth);
	});
});
