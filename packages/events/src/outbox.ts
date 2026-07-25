import {
	and,
	apiOutboxEvents,
	asc,
	db as defaultDb,
	eq,
	inArray,
	isNull,
	lt,
	lte,
	sql,
} from "@quickengine/db";

/**
 * Outbox drain — the delivery half of the transactional outbox.
 *
 * Writers commit an `api_outbox_events` row inside the same transaction as the
 * domain change, so an event exists if and only if the change did. This drains
 * those rows and hands each to the registered handlers.
 *
 * **Delivery is at-least-once.** A handler can see the same event twice: the
 * process can die after a handler succeeds but before the row is marked
 * published. That is deliberate — the alternative (marking published first) is
 * at-most-once, which silently drops events on any crash. Every handler must be
 * idempotent on `event.id`, which is stable across redeliveries.
 */

export type OutboxEvent = {
	id: string;
	workspaceId: string;
	aggregateType: string;
	aggregateId: string;
	eventName: string;
	version: number;
	payload: Record<string, unknown>;
	requestId: string;
	actorId: string | null;
	actorType: string | null;
	occurredAt: Date;
	/** How many delivery attempts have been made, including this one. */
	attempts: number;
};

export type OutboxHandler = {
	name: string;
	handle: (event: OutboxEvent) => Promise<void> | void;
};

export type DrainOutboxOptions = {
	handlers: OutboxHandler[];
	/** Max events claimed per drain. */
	batchSize?: number;
	/** Give up after this many failed attempts; the row is left for inspection. */
	maxAttempts?: number;
	/** How long a claimed event stays invisible before another drain may retry it. */
	leaseMs?: number;
	/** Delay before the next attempt, given the attempt count just used. */
	backoffMs?: (attempts: number) => number;
	/** Called for every handler failure. Failures never propagate to the caller. */
	onError?: (
		error: unknown,
		context: { event: OutboxEvent; handler: string },
	) => void;
	now?: () => Date;
	database?: typeof defaultDb;
};

export type DrainOutboxResult = {
	/** Events claimed by this drain. */
	claimed: number;
	/** Delivered to every handler and marked published. */
	published: number;
	/** A handler failed; the event is scheduled for another attempt. */
	retrying: number;
	/** Attempts exhausted; the event will not be retried without intervention. */
	exhausted: number;
};

// Exponential with a ceiling: 1s, 2s, 4s … capped at 5 minutes. A failing
// endpoint shouldn't be hammered, but a transient blip shouldn't wait long.
const defaultBackoff = (attempts: number) =>
	Math.min(1_000 * 2 ** (attempts - 1), 300_000);

export async function drainOutbox(
	options: DrainOutboxOptions,
): Promise<DrainOutboxResult> {
	const {
		handlers,
		batchSize = 50,
		maxAttempts = 8,
		leaseMs = 60_000,
		backoffMs = defaultBackoff,
		onError = () => {},
		now = () => new Date(),
		database = defaultDb,
	} = options;

	const startedAt = now();

	// Claim in its own transaction, then run handlers outside it. Handlers do
	// network I/O (realtime, webhooks); holding a row lock across that would pin
	// a database connection for the duration of someone else's slow endpoint.
	//
	// The claim is a lease: `available_at` moves into the future and `attempts`
	// increments up front, so a drain that dies mid-flight releases the event
	// when the lease expires instead of stranding it, and a crash-loop still
	// exhausts its attempts rather than retrying forever.
	const claimed = await database.transaction(async (tx) => {
		const pending = await tx
			.select({ id: apiOutboxEvents.id })
			.from(apiOutboxEvents)
			.where(
				and(
					isNull(apiOutboxEvents.publishedAt),
					lte(apiOutboxEvents.availableAt, startedAt),
					lt(apiOutboxEvents.attempts, maxAttempts),
				),
			)
			.orderBy(asc(apiOutboxEvents.occurredAt))
			.limit(batchSize)
			.for("update", { skipLocked: true });

		if (pending.length === 0) return [];

		return tx
			.update(apiOutboxEvents)
			.set({
				attempts: sql`${apiOutboxEvents.attempts} + 1`,
				availableAt: new Date(startedAt.getTime() + leaseMs),
			})
			.where(
				inArray(
					apiOutboxEvents.id,
					pending.map((row) => row.id),
				),
			)
			.returning();
	});

	const result: DrainOutboxResult = {
		claimed: claimed.length,
		published: 0,
		retrying: 0,
		exhausted: 0,
	};
	if (claimed.length === 0) return result;

	const delivered: string[] = [];

	for (const row of claimed) {
		const event: OutboxEvent = {
			id: row.id,
			workspaceId: row.workspaceId,
			aggregateType: row.aggregateType,
			aggregateId: row.aggregateId,
			eventName: row.eventName,
			version: row.version,
			payload: row.payload,
			requestId: row.requestId,
			actorId: row.actorId,
			actorType: row.actorType,
			occurredAt: row.occurredAt,
			attempts: row.attempts,
		};

		// One failing handler must not rob the others of an event they can
		// process, so every handler runs; the event retries if any of them failed.
		let failed = false;
		for (const handler of handlers) {
			try {
				await handler.handle(event);
			} catch (error) {
				failed = true;
				onError(error, { event, handler: handler.name });
			}
		}

		if (!failed) {
			delivered.push(row.id);
			continue;
		}

		if (row.attempts >= maxAttempts) {
			// Out of attempts. Leave `published_at` null so the row is still visible
			// for inspection, but the attempts filter keeps it out of future claims
			// instead of blocking the events behind it.
			result.exhausted += 1;
			continue;
		}

		result.retrying += 1;
		await database
			.update(apiOutboxEvents)
			.set({ availableAt: new Date(now().getTime() + backoffMs(row.attempts)) })
			.where(eq(apiOutboxEvents.id, row.id));
	}

	if (delivered.length > 0) {
		await database
			.update(apiOutboxEvents)
			.set({ publishedAt: now() })
			.where(inArray(apiOutboxEvents.id, delivered));
		result.published = delivered.length;
	}

	return result;
}
