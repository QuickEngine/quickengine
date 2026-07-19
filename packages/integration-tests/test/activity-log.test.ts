import { listWorkspaceActivity, recordActivity } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { getEventBus } from "@quickengine/events";
import {
	createClientRecord,
	deleteClientRecord,
	updateClientRecord,
} from "@quickengine/mod-client-records";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const ownerId = "activity-owner";
const workspaceId = "00000000-0000-4000-8000-0000000a0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000a0002";

// Wire the activity writer to the process-wide bus exactly as the app's instrumentation
// does, so these tests exercise the real emit → subscriber → persist path.
beforeAll(() => {
	getEventBus().subscribe((event) => recordActivity(event));
});

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
		const record = await createClientRecord(
			workspaceId,
			{ name: "Ada" },
			{ actorId: ownerId },
		);
		await updateClientRecord(
			workspaceId,
			record.id,
			{ name: "Ada L." },
			{ actorId: ownerId },
		);
		await deleteClientRecord(workspaceId, record.id, { actorId: ownerId });

		const activity = await listWorkspaceActivity(workspaceId);
		expect(activity.map((row) => row.name)).toEqual([
			"client_records.record.deleted",
			"client_records.record.updated",
			"client_records.record.created",
		]);
		// Provenance is captured for the audit trail.
		expect(activity[0]).toMatchObject({
			workspaceId,
			recordId: record.id,
			actorId: ownerId,
		});
		// Monotonic sequence, newest-first.
		expect(activity[0].seq).toBeGreaterThan(activity[1].seq);
	});

	it("scopes the feed to its workspace", async () => {
		await createClientRecord(workspaceId, { name: "Mine" });
		await createClientRecord(otherWorkspaceId, { name: "Theirs" });

		const mine = await listWorkspaceActivity(workspaceId);
		expect(mine).toHaveLength(1);
		expect(mine[0].name).toBe("client_records.record.created");
	});

	it("is idempotent on the event id (a replay writes no duplicate)", async () => {
		const event = {
			id: "00000000-0000-4000-8000-0000000a0099",
			workspaceId,
			name: "client_records.record.created",
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
