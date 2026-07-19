import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createPusherRealtimeProvider,
	getRealtimeProvider,
	parseWorkspaceChannel,
	resetPusherServerForTests,
	resetRealtimeProviderForTests,
	workspaceChannel,
} from "../src";

describe("channel naming", () => {
	it("round-trips workspace id through the channel name", () => {
		const channel = workspaceChannel("ws-1");
		expect(channel).toBe("private-workspace-ws-1");
		expect(parseWorkspaceChannel(channel)).toBe("ws-1");
	});

	it("rejects non-workspace channels and empty ids", () => {
		expect(parseWorkspaceChannel("private-user-123")).toBeNull();
		expect(parseWorkspaceChannel("presence-workspace-ws-1")).toBeNull();
		expect(parseWorkspaceChannel("private-workspace-")).toBeNull();
	});
});

describe("createPusherRealtimeProvider", () => {
	it("publishes by triggering the event on its channel", async () => {
		const trigger = vi.fn().mockResolvedValue(undefined);
		const provider = createPusherRealtimeProvider({ trigger });

		await provider.publish({
			channel: workspaceChannel("ws-1"),
			name: "client_records.record.created",
			payload: { id: "evt-1", recordId: "rec-1" },
		});

		expect(trigger).toHaveBeenCalledWith(
			"private-workspace-ws-1",
			"client_records.record.created",
			{ id: "evt-1", recordId: "rec-1" },
		);
	});
});

describe("getRealtimeProvider", () => {
	const keys = [
		"PUSHER_APP_ID",
		"PUSHER_KEY",
		"PUSHER_SECRET",
		"PUSHER_CLUSTER",
	] as const;
	const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

	afterEach(() => {
		for (const k of keys) {
			if (original[k] === undefined) delete process.env[k];
			else process.env[k] = original[k];
		}
		resetPusherServerForTests();
		resetRealtimeProviderForTests();
	});

	it("selects the offline no-op provider when the Pusher keys are absent", async () => {
		for (const k of keys) delete process.env[k];
		resetPusherServerForTests();
		resetRealtimeProviderForTests();

		const provider = getRealtimeProvider();
		// No-op resolves without any client; assert it doesn't throw and is memoized.
		await expect(
			provider.publish({ channel: "c", name: "n", payload: {} }),
		).resolves.toBeUndefined();
		expect(getRealtimeProvider()).toBe(provider);
	});
});
