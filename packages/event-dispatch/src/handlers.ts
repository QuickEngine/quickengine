import { recordActivity } from "@quickengine/db";
import type { OutboxEvent, OutboxHandler } from "@quickengine/events";
import { getClientRecord } from "@quickengine/mod-client-records";
import {
	getRealtimeProvider,
	type RealtimeProvider,
	workspaceChannel,
} from "@quickengine/realtime";
import { getSearchProvider, type SearchProvider } from "@quickengine/search";
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
			if (!event.eventName.startsWith("client.")) return;
			// `client.address.*` changes nothing that is indexed (name, email, company).
			if (event.eventName.startsWith("client.address.")) return;

			if (event.eventName === "client.deleted") {
				await provider.remove("quickdash", [event.aggregateId]);
				return;
			}

			const record = await getClientRecord(
				event.workspaceId,
				event.aggregateId,
			);
			// Already gone: a later delete event will remove it from the index.
			if (!record) return;

			const description =
				[record.email, record.company].filter(Boolean).join(" · ") || undefined;
			await provider.index("quickdash", [
				{
					objectID: record.id,
					title: record.name,
					description,
					url: `/${event.workspaceId}/client-records`,
					metadata: {
						workspaceId: event.workspaceId,
						module: "client-records",
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
		webhookFanoutHandler(),
	];
}
