import {
	and,
	asc,
	db as defaultDb,
	eq,
	inArray,
	lt,
	lte,
	sql,
	webhookDeliveries,
	webhookEndpoints,
} from "@quickengine/db";
import {
	decryptWebhookSecret,
	type OutboxEvent,
	type OutboxHandler,
	signWebhookPayload,
} from "@quickengine/events";

/**
 * Outbound webhook delivery, in two stages.
 *
 * **Stage 1 — fan-out** (`webhookFanoutHandler`) runs inside the outbox
 * dispatcher and only writes rows: one `webhook_deliveries` per subscribed
 * endpoint. It must stay fast, because it shares a cycle with every other
 * handler.
 *
 * **Stage 2 — delivery** (`deliverPendingWebhooks`) makes the HTTP calls on its
 * own schedule. Splitting them is what gives each endpoint its own retry clock:
 * if delivery happened inside the outbox drain, one customer's broken endpoint
 * would stall every workspace's events, and retrying the event would redeliver
 * it to endpoints that had already accepted it.
 */

/** The JSON body a customer's endpoint receives. */
export type WebhookPayload = {
	id: string;
	type: string;
	createdAt: string;
	workspaceId: string;
	data: {
		id: string;
		type: string;
		attributes: Record<string, unknown>;
	};
};

function webhookPayload(event: OutboxEvent): WebhookPayload {
	return {
		// The outbox event id: stable across redeliveries, so a consumer dedupes on it.
		id: event.id,
		type: event.eventName,
		createdAt: event.occurredAt.toISOString(),
		workspaceId: event.workspaceId,
		data: {
			id: event.aggregateId,
			type: event.aggregateType,
			attributes: event.payload,
		},
	};
}

/** Whether an endpoint subscribed to this event. An empty filter means "all". */
export function endpointWantsEvent(
	eventTypes: string[],
	eventName: string,
): boolean {
	if (eventTypes.length === 0) return true;
	return eventTypes.includes(eventName);
}

/**
 * Stage 1: queue this event for every endpoint that wants it.
 *
 * Outbox delivery is at-least-once, so this can run twice for the same event.
 * The unique index on (endpoint_id, event_id) plus `onConflictDoNothing` is what
 * turns that into exactly one HTTP call per endpoint.
 */
export function webhookFanoutHandler(
	database: typeof defaultDb = defaultDb,
): OutboxHandler {
	return {
		name: "webhook-fanout",
		async handle(event: OutboxEvent) {
			const endpoints = await database
				.select()
				.from(webhookEndpoints)
				.where(
					and(
						eq(webhookEndpoints.workspaceId, event.workspaceId),
						eq(webhookEndpoints.enabled, true),
					),
				);

			const wanted = endpoints.filter((endpoint) =>
				endpointWantsEvent(endpoint.eventTypes, event.eventName),
			);
			if (wanted.length === 0) return;

			await database
				.insert(webhookDeliveries)
				.values(
					wanted.map((endpoint) => ({
						workspaceId: event.workspaceId,
						endpointId: endpoint.id,
						eventId: event.id,
						eventName: event.eventName,
						payload: webhookPayload(event) as unknown as Record<
							string,
							unknown
						>,
					})),
				)
				.onConflictDoNothing({
					target: [webhookDeliveries.endpointId, webhookDeliveries.eventId],
				});
		},
	};
}

export type DeliverWebhooksOptions = {
	batchSize?: number;
	maxAttempts?: number;
	leaseMs?: number;
	timeoutMs?: number;
	backoffMs?: (attempts: number) => number;
	fetcher?: typeof fetch;
	now?: () => Date;
	database?: typeof defaultDb;
	/** Disable an endpoint after this many consecutive exhausted deliveries. */
	disableAfterExhausted?: number;
};

export type DeliverWebhooksResult = {
	claimed: number;
	succeeded: number;
	retrying: number;
	exhausted: number;
	endpointsDisabled: number;
};

// Slower and longer-reaching than the outbox's: a customer's endpoint may be down
// for a deploy, and giving up in seconds would be unhelpful. 10s → ~1 hour cap.
const defaultBackoff = (attempts: number) =>
	Math.min(10_000 * 2 ** (attempts - 1), 3_600_000);

/** Response bodies are kept for debugging, not archived — cap what we store. */
const MAX_RESPONSE_BODY = 2_000;

/**
 * Stage 2: send the queued deliveries.
 *
 * Never throws: this is called by a scheduled job, and one unreachable endpoint
 * must not abort the cycle for everyone else.
 */
export async function deliverPendingWebhooks(
	options: DeliverWebhooksOptions = {},
): Promise<DeliverWebhooksResult> {
	const {
		batchSize = 25,
		maxAttempts = 8,
		leaseMs = 60_000,
		timeoutMs = 10_000,
		backoffMs = defaultBackoff,
		fetcher = fetch,
		now = () => new Date(),
		database = defaultDb,
		disableAfterExhausted = 5,
	} = options;

	const startedAt = now();

	// Claim first, send outside the transaction — an HTTP call must never be made
	// while holding a row lock.
	const claimed = await database.transaction(async (tx) => {
		const pending = await tx
			.select({ id: webhookDeliveries.id })
			.from(webhookDeliveries)
			.where(
				and(
					eq(webhookDeliveries.status, "pending"),
					lte(webhookDeliveries.availableAt, startedAt),
					lt(webhookDeliveries.attempts, maxAttempts),
				),
			)
			.orderBy(asc(webhookDeliveries.createdAt))
			.limit(batchSize)
			.for("update", { skipLocked: true });

		if (pending.length === 0) return [];

		return tx
			.update(webhookDeliveries)
			.set({
				attempts: sql`${webhookDeliveries.attempts} + 1`,
				availableAt: new Date(startedAt.getTime() + leaseMs),
			})
			.where(
				inArray(
					webhookDeliveries.id,
					pending.map((row) => row.id),
				),
			)
			.returning();
	});

	const result: DeliverWebhooksResult = {
		claimed: claimed.length,
		succeeded: 0,
		retrying: 0,
		exhausted: 0,
		endpointsDisabled: 0,
	};
	if (claimed.length === 0) return result;

	// One endpoint typically owns several deliveries in a batch; load each once.
	const endpointIds = [...new Set(claimed.map((row) => row.endpointId))];
	const endpoints = new Map(
		(
			await database
				.select()
				.from(webhookEndpoints)
				.where(inArray(webhookEndpoints.id, endpointIds))
		).map((endpoint) => [endpoint.id, endpoint]),
	);

	for (const delivery of claimed) {
		const endpoint = endpoints.get(delivery.endpointId);
		if (!endpoint) continue;

		const body = JSON.stringify(delivery.payload);
		let responseStatus: number | null = null;
		let responseBody: string | null = null;
		let error: string | null = null;

		try {
			const secret = decryptWebhookSecret(endpoint.secretCiphertext);
			const { header } = signWebhookPayload(secret, body, now().getTime());
			const response = await fetcher(endpoint.url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"user-agent": "QuickEngine-Webhooks/1",
					"quickengine-signature": header,
					"quickengine-event-id": delivery.eventId,
					"quickengine-event-type": delivery.eventName,
				},
				body,
				signal: AbortSignal.timeout(timeoutMs),
			});
			responseStatus = response.status;
			responseBody = (await response.text().catch(() => "")).slice(
				0,
				MAX_RESPONSE_BODY,
			);
		} catch (cause) {
			// Timeout, DNS, TLS — no HTTP status exists for these.
			error = cause instanceof Error ? cause.message : String(cause);
		}

		const ok =
			responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

		if (ok) {
			result.succeeded += 1;
			await database
				.update(webhookDeliveries)
				.set({
					status: "succeeded",
					deliveredAt: now(),
					responseStatus,
					responseBody,
					error: null,
				})
				.where(eq(webhookDeliveries.id, delivery.id));
			continue;
		}

		const spent = delivery.attempts >= maxAttempts;
		await database
			.update(webhookDeliveries)
			.set({
				status: spent ? "exhausted" : "pending",
				availableAt: spent
					? delivery.availableAt
					: new Date(now().getTime() + backoffMs(delivery.attempts)),
				responseStatus,
				responseBody,
				error,
			})
			.where(eq(webhookDeliveries.id, delivery.id));

		if (!spent) {
			result.retrying += 1;
			continue;
		}
		result.exhausted += 1;

		// An endpoint that has exhausted several deliveries in a row is gone, not
		// merely slow. Disabling it stops fan-out from queueing work that will only
		// ever be thrown away, and tells the customer where to look.
		if (disableAfterExhausted > 0) {
			const recent = await database
				.select({ status: webhookDeliveries.status })
				.from(webhookDeliveries)
				.where(eq(webhookDeliveries.endpointId, delivery.endpointId))
				.orderBy(sql`${webhookDeliveries.createdAt} desc`)
				.limit(disableAfterExhausted);

			const allExhausted =
				recent.length >= disableAfterExhausted &&
				recent.every((row) => row.status === "exhausted");

			if (allExhausted) {
				await database
					.update(webhookEndpoints)
					.set({
						enabled: false,
						disabledReason: `Disabled automatically after ${disableAfterExhausted} consecutive failed deliveries.`,
						updatedAt: now(),
					})
					.where(eq(webhookEndpoints.id, delivery.endpointId));
				result.endpointsDisabled += 1;
			}
		}
	}

	return result;
}
