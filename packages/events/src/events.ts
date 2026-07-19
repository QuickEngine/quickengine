import { randomUUID } from "node:crypto";
import { getJobQueue, type JobQueue } from "@quickengine/jobs";
import {
	createNoopRealtimeProvider,
	type RealtimeProvider,
} from "@quickengine/realtime";

// Canonical domain-event names: "<module>.<entity>.<verb>". Every name a module can
// emit is registered here so producers and consumers are typed against one list
// instead of stringly-typed across the codebase. Add new names as modules gain producers.
export const DOMAIN_EVENT_NAMES = [
	"client_records.record.created",
	"client_records.record.updated",
	"client_records.record.deleted",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

// The wire envelope — deliberately tiny. It carries identity and provenance only:
// never customer, address, or payment data. Consumers refetch authoritative state
// from (workspaceId, recordId). `id` is the idempotency key downstream jobs dedupe on;
// `actorId` (user id or api-key id) is what lets the audit log answer "who did it".
export type DomainEvent = {
	id: string;
	workspaceId: string;
	name: DomainEventName;
	recordId: string;
	actorId?: string;
	occurredAt: Date;
};

// What a producer supplies; the bus fills in `id` and `occurredAt`.
export type EmitInput = {
	workspaceId: string;
	name: DomainEventName;
	recordId: string;
	actorId?: string;
	occurredAt?: Date;
};

export type DomainEventSubscriber = (
	event: DomainEvent,
) => void | Promise<void>;

// The stage that failed, so an onError handler can tell a bad in-process subscriber
// apart from a realtime/job-provider hiccup.
export type EmitStage = "subscriber" | "realtime" | "jobs";

export type EventBus = {
	// Fires after the producer's write has committed. Best-effort: a failure in any
	// single side-effect never rejects (the write already succeeded) — it is routed
	// to onError so one bad consumer can't take down the others or the caller.
	emit(input: EmitInput): Promise<DomainEvent>;
	// Register an in-process subscriber; returns an unsubscribe function.
	subscribe(subscriber: DomainEventSubscriber): () => void;
};

export type CreateEventBusOptions = {
	realtime: RealtimeProvider;
	jobs: JobQueue;
	onError?: (
		error: unknown,
		context: { event: DomainEvent; stage: EmitStage },
	) => void;
	// Injectable for deterministic tests.
	generateId?: () => string;
	now?: () => Date;
};

// Pusher private channels are prefixed `private-`; one channel per workspace keeps
// realtime fan-out tenant-scoped and authorizable by workspace membership.
export function workspaceChannel(workspaceId: string): string {
	return `private-workspace-${workspaceId}`;
}

export function createEventBus(options: CreateEventBusOptions): EventBus {
	const { realtime, jobs } = options;
	const generateId = options.generateId ?? (() => randomUUID());
	const now = options.now ?? (() => new Date());
	const onError = options.onError ?? (() => {});
	const subscribers = new Set<DomainEventSubscriber>();

	const report = (error: unknown, event: DomainEvent, stage: EmitStage) => {
		onError(error, { event, stage });
	};

	return {
		subscribe(subscriber) {
			subscribers.add(subscriber);
			return () => {
				subscribers.delete(subscriber);
			};
		},

		async emit(input) {
			const event: DomainEvent = {
				id: generateId(),
				workspaceId: input.workspaceId,
				name: input.name,
				recordId: input.recordId,
				actorId: input.actorId,
				occurredAt: input.occurredAt ?? now(),
			};

			// (1) In-process subscribers — isolated so one throwing doesn't stop the rest.
			for (const subscriber of subscribers) {
				try {
					await subscriber(event);
				} catch (error) {
					report(error, event, "subscriber");
				}
			}

			// (2) Realtime fan-out — private workspace channel, minimal payload; the
			// browser refetches authoritative state on receipt.
			try {
				await realtime.publish({
					channel: workspaceChannel(event.workspaceId),
					name: event.name,
					payload: { id: event.id, recordId: event.recordId },
				});
			} catch (error) {
				report(error, event, "realtime");
			}

			// (3) Durable dispatch — one job per event, idempotent on the event id. The
			// consumer (Inngest, a later branch) routes it to audit / search / notifications.
			try {
				await jobs.enqueue({
					name: "event.dispatch",
					idempotencyKey: event.id,
					payload: {
						eventId: event.id,
						workspaceId: event.workspaceId,
						name: event.name,
						recordId: event.recordId,
						actorId: event.actorId ?? null,
						occurredAt: event.occurredAt.toISOString(),
					},
				});
			} catch (error) {
				report(error, event, "jobs");
			}

			return event;
		},
	};
}

// The process-wide default bus. The durable side is now the env-selected job queue
// (Inngest when configured, in-memory offline otherwise); realtime is still the no-op
// provider until the Pusher branch. Providers swap in behind these without touching any
// producer, since modules only ever see `emit()`.
let defaultBus: EventBus | undefined;

export function getEventBus(): EventBus {
	if (!defaultBus) {
		defaultBus = createEventBus({
			realtime: createNoopRealtimeProvider(),
			jobs: getJobQueue(),
		});
	}
	return defaultBus;
}
