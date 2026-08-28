import { recordActivity } from "@quickengine/db";
import type { OutboxEvent, OutboxHandler } from "@quickengine/events";
import { searchSubjectFor } from "@quickengine/module-registry";
import {
	getRealtimeProvider,
	type RealtimeProvider,
	workspaceChannel,
} from "@quickengine/realtime";
import { getSearchProvider, type SearchProvider } from "@quickengine/search";
import { customerNotificationHandler } from "./customer-notifications";
import { operatorNotificationHandler } from "./operator-notifications";
import { referralSettlementHandler } from "./referral-settlement";
import { refundRestockHandler } from "./refund-restock";
import { subscriptionPaymentMethodHandler } from "./subscription-payment-method";
import { supplierHandoffHandler } from "./supplier-handoff";
import { supplierRefundHandler } from "./supplier-refund";
import { supplierSettlementHandler } from "./supplier-settlement";
import { webhookFanoutHandler } from "./webhooks";

/**
 * Outbox handlers — what actually happens when a committed event is delivered.
 *
 * These live above both the drain (infrastructure, in `@quickengine/events`) and
 * the modules, because a handler may need to read domain state to do its job.
 * Wiring them here keeps `@quickengine/events` free of any module dependency.
 *
 * Every handler must be idempotent on `event.id`: delivery is at-least-once, so
 * the same event can arrive twice.
 */

/** The workspace activity feed — "what happened here". */
export function activityHandler(): OutboxHandler {
	return {
		name: "activity",
		async handle(event: OutboxEvent) {
			await recordActivity({
				// The outbox row id IS the event id, so a redelivery collides with the
				// row it already wrote and is discarded rather than duplicated.
				id: event.id,
				workspaceId: event.workspaceId,
				name: event.eventName,
				recordId: event.aggregateId,
				actorId: event.actorId,
				occurredAt: event.occurredAt,
			});
		},
	};
}

/**
 * Realtime fan-out on the workspace's private channel.
 *
 * The payload stays deliberately tiny — identity and provenance only, never
 * customer data — because the channel is a notification, not a data feed. The
 * browser refetches authoritative state on receipt.
 */
export function realtimeHandler(
	provider: RealtimeProvider = getRealtimeProvider(),
): OutboxHandler {
	return {
		name: "realtime",
		async handle(event: OutboxEvent) {
			await provider.publish({
				channel: workspaceChannel(event.workspaceId),
				name: event.eventName,
				payload: { id: event.id, recordId: event.aggregateId },
			});
		},
	};
}

/**
 * Keeps the search index in step with client records.
 *
 * Search is not a source of truth, so this reads current state rather than
 * trusting the event payload, and a miss is survivable — but failures still
 * propagate, so the drain retries instead of silently dropping the update. Extend
 * the branches as more modules become searchable.
 */
export function searchHandler(
	provider: SearchProvider = getSearchProvider(),
): OutboxHandler {
	return {
		name: "search",
		async handle(event: OutboxEvent) {
			const subject = searchSubjectFor(event.eventName);
			if (!subject) return;

			// Sub-entity events. An address change moves nothing that is indexed, and
			// re-indexing on one only costs a read.
			if (event.eventName.startsWith("client.address.")) return;

			if (event.eventName.endsWith(".deleted")) {
				await provider.remove("quickdash", [event.aggregateId]);
				return;
			}

			const record = await subject.read(event.workspaceId, event.aggregateId);
			// Already gone: a later delete event will remove it from the index.
			if (!record) return;

			await provider.index("quickdash", [
				{
					objectID: event.aggregateId,
					title: record.title,
					description: record.description,
					url: `/${event.workspaceId}/${subject.module}`,
					metadata: {
						workspaceId: event.workspaceId,
						module: subject.module,
					},
				},
			]);
		},
	};
}

/**
 * Every handler the dispatcher runs, in the order they are applied.
 *
 * Webhook fan-out is last and only writes rows — the HTTP calls happen in a
 * separate worker, so a customer's slow endpoint cannot delay the feed, realtime,
 * or search for anyone else.
 */
export function defaultOutboxHandlers(): OutboxHandler[] {
	return [
		activityHandler(),
		realtimeHandler(),
		searchHandler(),
		// Transactional mail to the workspace's own customers. Sits before webhook
		// fan-out because a receipt matters more than a third-party integration,
		// and it swallows its own failures so a mail outage cannot stall the rest.
		customerNotificationHandler(),
		// The bell. Tells the people who RUN the business what happened in it,
		// where `customerNotificationHandler` above tells their shopper.
		operatorNotificationHandler(),
		// Routes a paid order to whoever actually ships it. Writes the record
		// whatever happens; only the notifying varies by handoff method.
		supplierHandoffHandler(),
		// 🔴 Pays that supplier what the purchase order says they are owed. The
		// money was already held back at checkout as the charge's application fee,
		// so without this QuickEngine COLLECTS a supplier's share and never sends
		// it on. Registered after the handoff so the purchase orders it settles
		// already exist.
		supplierSettlementHandler(),
		// 🔴 Credits the partner who brought the sale, and takes it back on a
		// refund. Until this was registered the two functions that do it had no
		// caller at all, so a partner earned nothing however much they sold.
		referralSettlementHandler(),
		// 🔴 Remembers the card the customer just used, so the subscription they
		// signed up for can actually renew. Without it a subscription charges
		// nothing on its second month and nothing says why.
		subscriptionPaymentMethodHandler(),
		// 🔴 Puts the goods back on the shelf when a refund goes out. Without it a
		// refunded item stays sold as far as stock is concerned, and the count
		// drifts quietly downwards for ever.
		refundRestockHandler(),
		// 🔴 Pulls the supplier's share back when the customer's money goes back.
		// Without it a full refund came out of the BUSINESS's own balance, because
		// the supplier had already been paid automatically and kept it.
		supplierRefundHandler(),
		webhookFanoutHandler(),
	];
}
