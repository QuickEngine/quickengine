import { apiOutboxEvents, db, listWorkspaceActivity } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import type { OutboxEvent } from "@quickengine/events";
import type { RealtimeProvider } from "@quickengine/realtime";
import type { SearchProvider } from "@quickengine/search";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	activityHandler,
	dispatchPendingEvents,
	realtimeHandler,
	searchHandler,
} from "../src";

const ownerId = "dispatch-owner";
const workspaceId = "00000000-0000-4000-8000-0000000d0001";
const clientId = "00000000-0000-4000-8000-0000000d0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Dispatch Owner', 'dispatch@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Dispatch Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
});

const event = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
	id: crypto.randomUUID(),
	workspaceId,
	aggregateType: "client",
	aggregateId: clientId,
	eventName: "client.created",
	version: 1,
	payload: {},
	requestId: crypto.randomUUID(),
	actorId: ownerId,
	actorType: "user",
	occurredAt: new Date(),
	attempts: 1,
	...overrides,
});

const fakeRealtime = () => {
	const published: unknown[] = [];
	const provider: RealtimeProvider = {
		publish: async (e) => {
			published.push(e);
		},
	};
	return { published, provider };
};

const fakeSearch = () => {
	const indexed: unknown[] = [];
	const removed: string[][] = [];
	const provider = {
		index: async (_name: string, records: unknown[]) => {
			indexed.push(...records);
		},
		remove: async (_name: string, ids: string[]) => {
			removed.push(ids);
		},
		search: async () => [],
		configure: async () => {},
	} as unknown as SearchProvider;
	return { indexed, removed, provider };
};

/** Writes a pending outbox row the way the unit of work does. */
async function pending(overrides: Record<string, unknown> = {}) {
	const [row] = await db
		.insert(apiOutboxEvents)
		.values({
			actorId: ownerId,
			actorType: "user",
			aggregateId: clientId,
			aggregateType: "client",
			eventName: "client.created",
			payload: {},
			requestId: crypto.randomUUID(),
			version: 1,
			workspaceId,
			...overrides,
		})
		.returning();
	return row;
}

describe("activity handler", () => {
	it("writes the event to the workspace activity feed", async () => {
		const e = event();
		await activityHandler().handle(e);

		const [row] = await listWorkspaceActivity(workspaceId, 10);
		expect(row).toMatchObject({
			id: e.id,
			name: "client.created",
			recordId: clientId,
			actorId: ownerId,
		});
	});

	it("is idempotent, because delivery is at-least-once", async () => {
		const e = event();
		await activityHandler().handle(e);
		// A redelivery must not double the feed entry.
		await activityHandler().handle(e);

		expect(await listWorkspaceActivity(workspaceId, 10)).toHaveLength(1);
	});
});

describe("realtime handler", () => {
	it("publishes identity only on the workspace's private channel", async () => {
		const { published, provider } = fakeRealtime();
		const e = event();

		await realtimeHandler(provider).handle(e);

		expect(published).toEqual([
			{
				channel: `private-workspace-${workspaceId}`,
				name: "client.created",
				// No customer data crosses the channel — just enough to refetch.
				payload: { id: e.id, recordId: clientId },
			},
		]);
	});
});

describe("search handler", () => {
	it("indexes the record's current content on create", async () => {
		const { indexed, provider } = fakeSearch();

		await searchHandler(provider).handle(event());

		expect(indexed).toEqual([
			expect.objectContaining({
				objectID: clientId,
				title: "Ada Lovelace",
				description: "ada@example.com · Analytical Engines",
				metadata: { workspaceId, module: "client-records" },
			}),
		]);
	});

	it("removes the record from the index on delete", async () => {
		const { removed, indexed, provider } = fakeSearch();

		await searchHandler(provider).handle(
			event({ eventName: "client.deleted" }),
		);

		expect(removed).toEqual([[clientId]]);
		expect(indexed).toHaveLength(0);
	});

	it("ignores events from modules that are not searchable", async () => {
		const { indexed, removed, provider } = fakeSearch();

		await searchHandler(provider).handle(
			event({ eventName: "quote.accepted" }),
		);
		// Address changes touch nothing that is indexed.
		await searchHandler(provider).handle(
			event({ eventName: "client.address.updated" }),
		);

		expect(indexed).toHaveLength(0);
		expect(removed).toHaveLength(0);
	});

	it("tolerates a record that has already been deleted", async () => {
		const { indexed, provider } = fakeSearch();

		await expect(
			searchHandler(provider).handle(
				event({ aggregateId: "00000000-0000-4000-8000-00000000dead" }),
			),
		).resolves.toBeUndefined();
		expect(indexed).toHaveLength(0);
	});
});

describe("dispatchPendingEvents", () => {
	it("drains a backlog larger than one batch in a single cycle", async () => {
		for (let i = 0; i < 5; i += 1) await pending();
		const seen: string[] = [];

		const result = await dispatchPendingEvents({
			batchSize: 2,
			handlers: [
				{
					name: "collector",
					handle: (e) => {
						seen.push(e.id);
					},
				},
			],
		});

		expect(result).toMatchObject({ claimed: 5, published: 5, retrying: 0 });
		expect(seen).toHaveLength(5);
	});

	it("stops after maxBatches instead of looping on a runaway producer", async () => {
		for (let i = 0; i < 6; i += 1) await pending();

		const result = await dispatchPendingEvents({
			batchSize: 1,
			maxBatches: 2,
			handlers: [{ name: "noop", handle: () => {} }],
		});

		expect(result).toMatchObject({ claimed: 2, published: 2 });
	});

	it("reports a handler failure without rejecting the cycle", async () => {
		await pending();
		const onError = vi.fn();

		const result = await dispatchPendingEvents({
			handlers: [
				{
					name: "broken",
					handle: () => {
						throw new Error("nope");
					},
				},
			],
			onError,
		});

		expect(result).toMatchObject({ published: 0, retrying: 1 });
		expect(onError).toHaveBeenCalledOnce();
	});
});
