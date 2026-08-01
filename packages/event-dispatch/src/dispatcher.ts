import {
	type DrainOutboxResult,
	drainOutbox,
	type OutboxHandler,
} from "@quickengine/events";
import { inngest } from "@quickengine/jobs";
import { defaultOutboxHandlers } from "./handlers";
import { mutationRetention, storageCleanup } from "./storage-cleanup";
import { deliverPendingWebhooks } from "./webhooks";

/**
 * Drains the outbox until it is empty (or the cycle budget is spent).
 *
 * One drain claims at most `batchSize` events, so a single pass can leave a
 * backlog behind. Looping here means a burst is cleared in one cycle instead of
 * trickling out one batch per minute, while `maxBatches` keeps a runaway
 * producer from holding the worker forever.
 */
export async function dispatchPendingEvents(options?: {
	handlers?: OutboxHandler[];
	batchSize?: number;
	maxBatches?: number;
	onError?: Parameters<typeof drainOutbox>[0]["onError"];
}): Promise<DrainOutboxResult> {
	const handlers = options?.handlers ?? defaultOutboxHandlers();
	const batchSize = options?.batchSize ?? 50;
	const maxBatches = options?.maxBatches ?? 20;

	const total: DrainOutboxResult = {
		claimed: 0,
		published: 0,
		retrying: 0,
		exhausted: 0,
	};

	for (let batch = 0; batch < maxBatches; batch += 1) {
		const result = await drainOutbox({
			handlers,
			batchSize,
			onError:
				options?.onError ??
				((error, context) =>
					console.error(
						`[event-dispatch] ${context.handler} failed for ${context.event.eventName} (${context.event.id}):`,
						error,
					)),
		});
		total.claimed += result.claimed;
		total.published += result.published;
		total.retrying += result.retrying;
		total.exhausted += result.exhausted;

		// Nothing claimed means the queue is drained, or everything left is leased
		// by another worker or backing off. Either way, stop.
		if (result.claimed === 0) break;
	}

	return total;
}

/**
 * The scheduled drain.
 *
 * Runs every minute rather than reacting to a per-write trigger: the outbox is
 * the durable record, so a cron cannot lose an event the way a dropped trigger
 * message could, and it recovers on its own after any outage. `concurrency: 1`
 * keeps overlapping cycles from fighting over the same rows — the lease already
 * makes that safe, but serialising avoids the wasted work.
 */
export const outboxDispatch = inngest.createFunction(
	{
		id: "outbox-dispatch",
		concurrency: 1,
		retries: 0, // The outbox retries individual events; a failed cycle just waits.
		triggers: [{ cron: "* * * * *" }],
	},
	async () => dispatchPendingEvents(),
);

/**
 * The scheduled webhook sender.
 *
 * Separate from `outbox-dispatch` on purpose: this one spends its time waiting on
 * other people's servers, so it must not share a cycle with the handlers that
 * keep the activity feed and search index current. `concurrency: 2` lets a slow
 * endpoint overlap with healthy ones without opening the floodgates.
 */
export const webhookDelivery = inngest.createFunction(
	{
		id: "webhook-delivery",
		concurrency: 2,
		retries: 0, // Each delivery carries its own attempt count and backoff.
		triggers: [{ cron: "* * * * *" }],
	},
	async () => deliverPendingWebhooks(),
);

/** Durable functions this package contributes to the Inngest serve endpoint. */
export const eventDispatchFunctions = [
	outboxDispatch,
	webhookDelivery,
	storageCleanup,
	mutationRetention,
];
