import type {
	EnqueueJobInput,
	EnqueueJobResult,
	JobQueue,
} from "@quickengine/jobs";
import type { RealtimeEvent, RealtimeProvider } from "@quickengine/realtime";
import { describe, expect, it, vi } from "vitest";
import { createEventBus, type DomainEvent, workspaceChannel } from "../src";

// Recording fakes so we can assert exactly what the bus fanned out.
function fakeRealtime() {
	const published: RealtimeEvent<Record<string, unknown>>[] = [];
	const provider: RealtimeProvider = {
		async publish(event) {
			published.push(event as RealtimeEvent<Record<string, unknown>>);
		},
	};
	return { provider, published };
}

function fakeJobs() {
	const enqueued: EnqueueJobInput[] = [];
	const queue: JobQueue = {
		async enqueue(input): Promise<EnqueueJobResult> {
			enqueued.push(input as EnqueueJobInput);
			return { id: input.idempotencyKey ?? "job", name: input.name };
		},
	};
	return { queue, enqueued };
}

const baseInput = {
	workspaceId: "ws-1",
	name: "client_records.record.created",
	recordId: "rec-1",
	actorId: "user-1",
} as const;

describe("createEventBus.emit", () => {
	it("stamps id + occurredAt and returns the full envelope", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
			generateId: () => "evt-fixed",
			now: () => new Date("2026-07-19T12:00:00.000Z"),
		});

		const event = await bus.emit(baseInput);

		expect(event).toEqual<DomainEvent>({
			id: "evt-fixed",
			workspaceId: "ws-1",
			name: "client_records.record.created",
			recordId: "rec-1",
			actorId: "user-1",
			occurredAt: new Date("2026-07-19T12:00:00.000Z"),
		});
	});

	it("publishes realtime on the private workspace channel with a minimal payload", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
			generateId: () => "evt-1",
		});

		await bus.emit(baseInput);

		expect(realtime.published).toHaveLength(1);
		expect(realtime.published[0]).toEqual({
			channel: workspaceChannel("ws-1"),
			name: "client_records.record.created",
			payload: { id: "evt-1", recordId: "rec-1" },
		});
		// No customer/payment fields leak into the wire payload.
		expect(realtime.published[0]?.payload).not.toHaveProperty("actorId");
	});

	it("enqueues one durable dispatch job keyed on the event id (idempotent)", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
			generateId: () => "evt-42",
			now: () => new Date("2026-07-19T12:00:00.000Z"),
		});

		await bus.emit(baseInput);

		expect(jobs.enqueued).toHaveLength(1);
		expect(jobs.enqueued[0]).toEqual({
			name: "event.dispatch",
			idempotencyKey: "evt-42",
			payload: {
				eventId: "evt-42",
				workspaceId: "ws-1",
				name: "client_records.record.created",
				recordId: "rec-1",
				actorId: "user-1",
				occurredAt: "2026-07-19T12:00:00.000Z",
			},
		});
	});

	it("delivers to in-process subscribers and honors unsubscribe", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
		});
		const seen = vi.fn();

		const unsubscribe = bus.subscribe(seen);
		await bus.emit(baseInput);
		expect(seen).toHaveBeenCalledTimes(1);
		expect(seen.mock.calls[0]?.[0]).toMatchObject({ recordId: "rec-1" });

		unsubscribe();
		await bus.emit(baseInput);
		expect(seen).toHaveBeenCalledTimes(1);
	});

	it("isolates a throwing subscriber: other consumers still run, emit resolves", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const onError = vi.fn();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
			onError,
		});
		const good = vi.fn();

		bus.subscribe(() => {
			throw new Error("bad subscriber");
		});
		bus.subscribe(good);

		await expect(bus.emit(baseInput)).resolves.toBeDefined();
		expect(good).toHaveBeenCalledTimes(1);
		expect(realtime.published).toHaveLength(1);
		expect(jobs.enqueued).toHaveLength(1);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), {
			event: expect.objectContaining({ recordId: "rec-1" }),
			stage: "subscriber",
		});
	});

	it("a realtime failure does not block durable dispatch, and is reported", async () => {
		const jobs = fakeJobs();
		const onError = vi.fn();
		const failingRealtime: RealtimeProvider = {
			async publish() {
				throw new Error("pusher down");
			},
		};
		const bus = createEventBus({
			realtime: failingRealtime,
			jobs: jobs.queue,
			onError,
		});

		await expect(bus.emit(baseInput)).resolves.toBeDefined();
		expect(jobs.enqueued).toHaveLength(1);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), {
			event: expect.objectContaining({ recordId: "rec-1" }),
			stage: "realtime",
		});
	});

	it("omits actorId when the producer doesn't supply one", async () => {
		const realtime = fakeRealtime();
		const jobs = fakeJobs();
		const bus = createEventBus({
			realtime: realtime.provider,
			jobs: jobs.queue,
			generateId: () => "evt-x",
		});

		const event = await bus.emit({
			workspaceId: "ws-1",
			name: "client_records.record.deleted",
			recordId: "rec-9",
		});

		expect(event.actorId).toBeUndefined();
		expect(jobs.enqueued[0]?.payload).toMatchObject({ actorId: null });
	});
});
