import {
	type DrainOutboxResult,
	drainOutbox,
	type OutboxHandler,
} from "@quickengine/events";
import { inngest } from "@quickengine/jobs";
import { defaultOutboxHandlers } from "./handlers";
import { mutationRetention, storageCleanup } from "./storage-cleanup";
import { renewDueSubscriptions } from "./subscription-renewal";
import { reconcileSupplierPayments } from "./supplier-reconciliation";
import { settlePendingSupplierPayments } from "./supplier-settlement-sweep";
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

/** Sent after a mutation commits, so its events drain now rather than on the tick. */
export const OUTBOX_WRITTEN_EVENT = "outbox/written";

/**
 * The drain: on every commit, and every minute regardless.
 *
 * The cron is the DURABLE half and is not going anywhere — the outbox is the
 * record of truth, so a cron cannot lose an event the way a dropped trigger
 * message could, and it recovers on its own after any outage.
 *
 * 🔴 But the cron was the ONLY trigger, which made it the floor on latency for
 * everything downstream: a paid order waited an average of 30 seconds and up to
 * 60 before its confirmation email, its purchase order, or its supplier handoff
 * even began. Measured on a real order 2026-08-29: 51 seconds, and 98 on another.
 *
 * The event trigger removes that floor while changing nothing about durability.
 * A nudge that is never sent, or is lost, costs latency only — the next tick
 * still drains the row. `concurrency: 1` keeps a nudge and a tick from fighting
 * over the same rows; the lease already makes that safe, but serialising avoids
 * the wasted work.
 */
export const outboxDispatch = inngest.createFunction(
	{
		id: "outbox-dispatch",
		concurrency: 1,
		retries: 0, // The outbox retries individual events; a failed cycle just waits.
		triggers: [{ cron: "* * * * *" }, { event: OUTBOX_WRITTEN_EVENT }],
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

/**
 * The scheduled renewal run.
 *
 * ⚠️ Hourly, not every minute. A subscription is due on a DAY, so checking sixty
 * times an hour buys nothing and multiplies the chance of two runs overlapping
 * on the same row. `concurrency: 1` because the work is short and serialising
 * removes a whole class of contention the unique cycle key would otherwise have
 * to absorb.
 */
export const subscriptionRenewal = inngest.createFunction(
	{
		id: "subscription-renewal",
		concurrency: 1,
		retries: 0, // A failed cycle is recorded on the row; the next hour retries.
		triggers: [{ cron: "0 * * * *" }],
	},
	async () => renewDueSubscriptions(),
);

/**
 * The scheduled supplier settlement sweep.
 *
 * 🔴 This is the ONLY thing that pays a supplier who was not ready when the
 * order was. `order.paid` records the obligation and attempts it once; if the
 * supplier has not finished connecting their payout account it stays
 * `calculated`, and nothing else would ever come back to it — the outbox gives
 * up after eight attempts, so an order paid on Monday would never settle for a
 * supplier who onboarded on Wednesday.
 *
 * ⚠️ Every fifteen minutes, not every minute. A supplier finishing onboarding is
 * a human action measured in days; checking sixty times an hour buys nothing and
 * multiplies contention. `concurrency: 1` because each row is claimed before the
 * provider is called and serialising removes the rest.
 */
export const supplierSettlementSweep = inngest.createFunction(
	{
		id: "supplier-settlement-sweep",
		concurrency: 1,
		retries: 0, // A failed cycle is recorded on the row; the next cycle retries.
		triggers: [{ cron: "*/15 * * * *" }],
	},
	async () => settlePendingSupplierPayments(),
);

/**
 * Ask the provider what became of money we sent a supplier.
 *
 * 🔴 Separate from the settlement sweep on purpose. That one SENDS money and
 * refuses to touch an uncertain row; this one only READS and writes our record
 * straight. Keeping them apart is what stops a reconciliation bug turning into a
 * double payment.
 *
 * Hourly rather than every minute: nothing here is urgent, and both cases it
 * resolves — a lost transfer id, a reversal after the fact — are discovered late
 * by nature.
 */
export const supplierReconciliation = inngest.createFunction(
	{
		id: "supplier-reconciliation",
		concurrency: 1,
		retries: 0,
		triggers: [{ cron: "17 * * * *" }],
	},
	async () => reconcileSupplierPayments(),
);

/** Durable functions this package contributes to the Inngest serve endpoint. */
export const eventDispatchFunctions = [
	outboxDispatch,
	supplierSettlementSweep,
	supplierReconciliation,
	subscriptionRenewal,
	webhookDelivery,
	storageCleanup,
	mutationRetention,
];
