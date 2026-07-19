import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createInngestJobQueue,
	getJobQueue,
	resetJobQueueForTests,
} from "../src";

describe("createInngestJobQueue", () => {
	it("maps enqueue onto an Inngest send: name → event, payload → data, key → id", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const queue = createInngestJobQueue({ send } as never);

		const result = await queue.enqueue({
			name: "event.dispatch",
			payload: { eventId: "evt-1", workspaceId: "ws-1" },
			idempotencyKey: "evt-1",
		});

		expect(send).toHaveBeenCalledWith({
			name: "event.dispatch",
			data: { eventId: "evt-1", workspaceId: "ws-1" },
			id: "evt-1",
		});
		expect(result).toEqual({ id: "evt-1", name: "event.dispatch" });
	});

	it("omits the idempotency id when no key is given, and derives a result id", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const queue = createInngestJobQueue({ send } as never);

		const result = await queue.enqueue({
			name: "search.index",
			payload: { recordId: "rec-1" },
		});

		expect(send).toHaveBeenCalledWith({
			name: "search.index",
			data: { recordId: "rec-1" },
		});
		expect(send.mock.calls[0]?.[0]).not.toHaveProperty("id");
		expect(result).toEqual({
			id: "inngest:search.index",
			name: "search.index",
		});
	});
});

describe("getJobQueue", () => {
	const original = process.env.INNGEST_EVENT_KEY;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.INNGEST_EVENT_KEY;
		} else {
			process.env.INNGEST_EVENT_KEY = original;
		}
		resetJobQueueForTests();
	});

	it("selects the offline in-memory queue when no event key is configured", async () => {
		delete process.env.INNGEST_EVENT_KEY;
		resetJobQueueForTests();

		const queue = getJobQueue();
		// The in-memory queue's result id has the `local-job:` signature (vs `inngest:`),
		// which is how we confirm the selection without touching the network.
		const result = await queue.enqueue({
			name: "storage.cleanup",
			payload: {},
		});
		expect(result.id).toBe("local-job:storage.cleanup");
	});

	it("memoizes the selection across calls", () => {
		delete process.env.INNGEST_EVENT_KEY;
		resetJobQueueForTests();

		expect(getJobQueue()).toBe(getJobQueue());
	});
});
