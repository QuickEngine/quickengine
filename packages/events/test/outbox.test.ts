import { apiOutboxEvents, db, eq } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { drainOutbox, type OutboxEvent, type OutboxHandler } from "../src";

const ownerId = "outbox-owner";
const workspaceId = "00000000-0000-4000-8000-0000000e0001";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Outbox Owner', 'outbox@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Outbox Workspace', 'agency')
	`;
});

/** Writes a pending outbox row the way the unit of work does. */
async function pendingEvent(overrides: Record<string, unknown> = {}) {
	const [row] = await db
		.insert(apiOutboxEvents)
		.values({
			actorId: ownerId,
			actorType: "user",
			aggregateId: "record_1",
			aggregateType: "client_record",
			eventName: "client_records.record.created",
			payload: { recordId: "record_1" },
			requestId: crypto.randomUUID(),
			version: 1,
			workspaceId,
			...overrides,
		})
		.returning();
	return row;
}

const collector = () => {
	const seen: OutboxEvent[] = [];
	const handler: OutboxHandler = {
		name: "collector",
		handle: (event) => {
			seen.push(event);
		},
	};
	return { seen, handler };
};

const failing = (name = "explodes"): OutboxHandler => ({
	name,
	handle: () => {
		throw new Error("handler blew up");
	},
});

const row = (id: string) =>
	db
		.select()
		.from(apiOutboxEvents)
		.where(eq(apiOutboxEvents.id, id))
		.then(([found]) => found);

describe("outbox drain", () => {
	it("delivers a pending event once and marks it published", async () => {
		const event = await pendingEvent();
		const { seen, handler } = collector();

		const result = await drainOutbox({ handlers: [handler] });

		expect(result).toMatchObject({ claimed: 1, published: 1, retrying: 0 });
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			id: event.id,
			workspaceId,
			eventName: "client_records.record.created",
			// The actor is carried on the event itself, so a handler never has to
			// join back to the mutation ledger to learn who caused it.
			actorId: ownerId,
			actorType: "user",
			attempts: 1,
		});
		expect((await row(event.id)).publishedAt).not.toBeNull();
	});

	it("does not redeliver an already published event", async () => {
		await pendingEvent();
		const first = collector();
		await drainOutbox({ handlers: [first.handler] });

		const second = collector();
		const result = await drainOutbox({ handlers: [second.handler] });

		expect(result).toMatchObject({ claimed: 0, published: 0 });
		expect(second.seen).toHaveLength(0);
	});

	it("leaves an event unpublished and schedules a retry when a handler fails", async () => {
		const event = await pendingEvent();

		const result = await drainOutbox({ handlers: [failing()] });

		expect(result).toMatchObject({ claimed: 1, published: 0, retrying: 1 });
		const stored = await row(event.id);
		expect(stored.publishedAt).toBeNull();
		expect(stored.attempts).toBe(1);
		// Backed off into the future, so an immediate second drain skips it.
		expect(stored.availableAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("still delivers to healthy handlers when a sibling handler throws", async () => {
		await pendingEvent();
		const { seen, handler } = collector();

		// One bad consumer must not starve the others of the event.
		await drainOutbox({ handlers: [failing(), handler] });

		expect(seen).toHaveLength(1);
	});

	it("retries a failed event once its backoff has elapsed", async () => {
		const event = await pendingEvent();
		await drainOutbox({ handlers: [failing()] });

		const { seen, handler } = collector();
		// Drain as if the backoff window had passed.
		const later = new Date(Date.now() + 60_000);
		const result = await drainOutbox({
			handlers: [handler],
			now: () => later,
		});

		expect(result).toMatchObject({ claimed: 1, published: 1 });
		expect(seen[0]).toMatchObject({ id: event.id, attempts: 2 });
	});

	it("stops retrying once attempts are exhausted, without blocking later events", async () => {
		const poison = await pendingEvent({ aggregateId: "poison" });
		await db
			.update(apiOutboxEvents)
			.set({ attempts: 8 })
			.where(eq(apiOutboxEvents.id, poison.id));
		const healthy = await pendingEvent({ aggregateId: "healthy" });

		const { seen, handler } = collector();
		const result = await drainOutbox({ handlers: [handler], maxAttempts: 8 });

		// The poison event is skipped entirely; the one behind it still goes out.
		expect(result).toMatchObject({ claimed: 1, published: 1 });
		expect(seen.map((e) => e.aggregateId)).toEqual(["healthy"]);
		expect((await row(poison.id)).publishedAt).toBeNull();
		expect((await row(healthy.id)).publishedAt).not.toBeNull();
	});

	it("claims events in the order they occurred", async () => {
		const older = await pendingEvent({
			aggregateId: "first",
			occurredAt: new Date(Date.now() - 10_000),
		});
		const newer = await pendingEvent({ aggregateId: "second" });

		const { seen, handler } = collector();
		await drainOutbox({ handlers: [handler] });

		expect(seen.map((e) => e.id)).toEqual([older.id, newer.id]);
		expect(seen.map((e) => e.aggregateId)).toEqual(["first", "second"]);
	});

	it("honours the batch size and leaves the remainder pending", async () => {
		await pendingEvent({ aggregateId: "a" });
		await pendingEvent({ aggregateId: "b" });
		await pendingEvent({ aggregateId: "c" });

		const { seen, handler } = collector();
		const result = await drainOutbox({ handlers: [handler], batchSize: 2 });

		expect(result).toMatchObject({ claimed: 2, published: 2 });
		expect(seen).toHaveLength(2);

		const rest = collector();
		const second = await drainOutbox({ handlers: [rest.handler] });
		expect(second).toMatchObject({ claimed: 1, published: 1 });
	});

	it("reports handler failures through onError instead of throwing", async () => {
		await pendingEvent();
		const failures: { handler: string; message: string }[] = [];

		// A drain must never reject: the caller is a scheduled job, and one bad
		// event should not take the whole cycle down.
		await expect(
			drainOutbox({
				handlers: [failing("webhook")],
				onError: (error, context) =>
					failures.push({
						handler: context.handler,
						message: (error as Error).message,
					}),
			}),
		).resolves.toMatchObject({ retrying: 1 });

		expect(failures).toEqual([
			{ handler: "webhook", message: "handler blew up" },
		]);
	});

	it("hides a claimed event from a concurrent drain via its lease", async () => {
		await pendingEvent();

		// Simulate a second worker starting while the first still holds the lease:
		// the claim moved `available_at` into the future, so there is nothing to take.
		await drainOutbox({ handlers: [failing()], leaseMs: 60_000 });
		const other = collector();
		const result = await drainOutbox({ handlers: [other.handler] });

		expect(result).toMatchObject({ claimed: 0 });
		expect(other.seen).toHaveLength(0);
	});
});
