import {
	latestActivitySeq,
	listWorkspaceActivity,
	listWorkspaceActivitySince,
	recordActivity,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { dispatchPendingEvents } from "@quickengine/event-dispatch";
import { createClientCommand } from "@quickengine/mod-client-records";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "cursor-owner";
const workspaceId = "00000000-0000-4000-8000-0000000c0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000c0002";

const context = (key: string, workspace = workspaceId) => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint: key,
	idempotencyKey: key,
	operation: "clients.create",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId: workspace,
});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Cursor Owner', 'cursor@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Cursor Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
});

/** Create `count` clients and deliver their events to the feed. */
async function happenings(count: number, prefix = "e") {
	for (let i = 0; i < count; i += 1) {
		await createClientCommand(context(`${prefix}-${i}`), {
			name: `${prefix}${i}`,
		});
	}
	await dispatchPendingEvents();
}

describe("activity cursor recovery", () => {
	it("returns everything after a cursor, oldest first", async () => {
		await happenings(3);
		const feed = await listWorkspaceActivity(workspaceId);
		// Pretend the client had applied the oldest event and then disconnected.
		const oldestSeq = feed.at(-1)?.seq ?? 0;
		expect(oldestSeq).toBeGreaterThan(0);

		const missed = await listWorkspaceActivitySince(workspaceId, oldestSeq);

		expect(missed).toHaveLength(2);
		// Ascending, so a client can apply them in the order they happened.
		expect(missed[0].seq).toBeLessThan(missed[1].seq);
		expect(missed.every((row) => row.seq > oldestSeq)).toBe(true);
	});

	it("returns nothing when the client is already up to date", async () => {
		await happenings(2);
		const latest = await latestActivitySeq(workspaceId);

		expect(await listWorkspaceActivitySince(workspaceId, latest)).toEqual([]);
	});

	it("replays the whole feed from cursor 0", async () => {
		await happenings(3);

		// A first-time client with no cursor asks from zero and misses nothing.
		expect(await listWorkspaceActivitySince(workspaceId, 0)).toHaveLength(3);
	});

	it("never leaks another workspace's events through the cursor", async () => {
		await createClientCommand(context("mine"), { name: "Mine" });
		await createClientCommand(context("theirs", otherWorkspaceId), {
			name: "Theirs",
		});
		await dispatchPendingEvents();

		const mine = await listWorkspaceActivitySince(workspaceId, 0);
		expect(mine).toHaveLength(1);
		// The other workspace's row exists and has a higher seq, but is invisible here.
		expect(await latestActivitySeq(otherWorkspaceId)).toBeGreaterThan(0);
	});

	it("advances the cursor monotonically across reconnects", async () => {
		await happenings(2, "first");
		let cursor = 0;

		const firstBatch = await listWorkspaceActivitySince(workspaceId, cursor);
		cursor = firstBatch.at(-1)?.seq ?? cursor;
		expect(firstBatch).toHaveLength(2);

		// Disconnected while more happened…
		await happenings(2, "second");

		const secondBatch = await listWorkspaceActivitySince(workspaceId, cursor);
		expect(secondBatch).toHaveLength(2);
		expect(secondBatch[0].seq).toBeGreaterThan(cursor);
		// …and nothing is delivered twice.
		const ids = new Set([...firstBatch, ...secondBatch].map((row) => row.id));
		expect(ids.size).toBe(4);
	});

	it("bounds a very large page so one client can't ask for the whole table", async () => {
		await happenings(4);

		expect(
			await listWorkspaceActivitySince(workspaceId, 0, 100_000),
		).toHaveLength(4);
		expect(await listWorkspaceActivitySince(workspaceId, 0, 2)).toHaveLength(2);
	});

	it("reports zero as the latest sequence for a workspace with no history", async () => {
		// A brand-new workspace must give the client a usable starting cursor
		// rather than undefined.
		expect(await latestActivitySeq(otherWorkspaceId)).toBe(0);
	});

	it("keeps a replayed event out of the feed a second time", async () => {
		await happenings(1);
		const [only] = await listWorkspaceActivity(workspaceId);

		// The dispatcher is at-least-once; a redelivery must not create a second
		// row, or every reconnecting client would see a phantom event.
		await recordActivity({
			id: only.id,
			workspaceId,
			name: only.name,
			recordId: only.recordId,
			actorId: only.actorId,
			occurredAt: only.occurredAt,
		});

		expect(await listWorkspaceActivitySince(workspaceId, 0)).toHaveLength(1);
	});
});
