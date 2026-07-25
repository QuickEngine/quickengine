import { listWorkspaceActivity, recordActivity } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { dispatchPendingEvents } from "@quickengine/event-dispatch";
import {
	createClientCommand,
	deleteClientCommand,
	updateClientCommand,
} from "@quickengine/mod-client-records";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "activity-owner";
const workspaceId = "00000000-0000-4000-8000-0000000a0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000a0002";

// The activity feed is fed by the outbox dispatcher, not by an in-process bus:
// a write commits its event in the same transaction, and a later drain delivers
// it. These tests exercise that whole durable path.
const context = (key: string, workspace = workspaceId) => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint: key,
	idempotencyKey: key,
	operation: "clients.write",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId: workspace,
});

const idOf = (outcome: Awaited<ReturnType<typeof createClientCommand>>) =>
	outcome.kind === "success" ? (outcome.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Activity Owner', 'activity@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Activity Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
});

describe("workspace activity log", () => {
	it("persists a row for each committed client-record event, newest first", async () => {
		const created = await createClientCommand(context("act-create"), {
			name: "Ada",
		});
		const recordId = idOf(created);
		await updateClientCommand(context("act-update"), recordId, {
			name: "Ada L.",
		});
		await deleteClientCommand(context("act-delete"), recordId);

		// Nothing reaches the feed until the dispatcher runs: the events are already
		// durable in the outbox, but delivery is a separate, retryable step.
		expect(await listWorkspaceActivity(workspaceId)).toHaveLength(0);

		await dispatchPendingEvents();

		const activity = await listWorkspaceActivity(workspaceId);
		expect(activity.map((row) => row.name)).toEqual([
			"client.deleted",
			"client.updated",
			"client.created",
		]);
		// Provenance is captured for the audit trail.
		expect(activity[0]).toMatchObject({
			workspaceId,
			recordId,
			actorId: ownerId,
		});
		// Monotonic sequence, newest-first.
		expect(activity[0].seq).toBeGreaterThan(activity[1].seq);
	});

	it("scopes the feed to its workspace", async () => {
		await createClientCommand(context("act-mine"), { name: "Mine" });
		await createClientCommand(context("act-theirs", otherWorkspaceId), {
			name: "Theirs",
		});
		await dispatchPendingEvents();

		const mine = await listWorkspaceActivity(workspaceId);
		expect(mine).toHaveLength(1);
		expect(mine[0].name).toBe("client.created");
	});

	it("writes no duplicate when the dispatcher runs twice", async () => {
		await createClientCommand(context("act-once"), { name: "Once" });

		await dispatchPendingEvents();
		// Delivery is at-least-once; a second cycle must not double the feed.
		await dispatchPendingEvents();

		expect(await listWorkspaceActivity(workspaceId)).toHaveLength(1);
	});

	it("is idempotent on the event id (a replay writes no duplicate)", async () => {
		const event = {
			id: "00000000-0000-4000-8000-0000000a0099",
			workspaceId,
			name: "client.created",
			recordId: "rec-1",
			actorId: ownerId,
			occurredAt: new Date(),
		};
		await recordActivity(event);
		await recordActivity(event);

		const activity = await listWorkspaceActivity(workspaceId);
		expect(activity).toHaveLength(1);
	});
});
