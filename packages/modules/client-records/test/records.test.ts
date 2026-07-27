import { apiOutboxEvents, asc, db, eq } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createClientCommand,
	deleteClientCommand,
	getClientRecord,
	listClientRecords,
	updateClientCommand,
} from "../src";

const mutationContext = (key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation: "clients.create",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const otherContext = (key: string) => ({
	...mutationContext(key),
	workspaceId: otherWorkspaceId,
});

const ownerId = "client-records-owner";
const workspaceId = "00000000-0000-4000-8000-000000000601";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000602";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Client Records Owner', 'clients@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Clients Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
});

describe("Client Records persistence", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createClientCommand(
			mutationContext("client-create-1"),
			{
				name: "Durable Client",
			},
		);
		const replay = await createClientCommand(
			mutationContext("client-create-1"),
			{
				name: "Durable Client",
			},
		);
		expect(first).toMatchObject({
			kind: "success",
			source: "executed",
			status: 201,
		});
		expect(replay).toMatchObject({
			kind: "success",
			source: "replayed",
			status: 201,
		});
		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from client_records where workspace_id = ${workspaceId}) clients,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			clients: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects reuse of an idempotency key with different validated input", async () => {
		await createClientCommand(mutationContext("client-create-2"), {
			name: "First",
		});
		const conflict = await createClientCommand(
			mutationContext("client-create-2", "different"),
			{ name: "Second" },
		);
		expect(conflict).toEqual({ kind: "conflict" });
		expect(await listClientRecords(workspaceId)).toHaveLength(1);
	});
	it("normalizes input and lists records deterministically", async () => {
		await createClientCommand(mutationContext("norm-1"), {
			name: "  Zoe Example  ",
			email: "",
			company: "  Example Co  ",
		});
		await createClientCommand(mutationContext("norm-2"), {
			name: "Ada Example",
			email: "ada@example.com",
		});

		const records = await listClientRecords(workspaceId);
		expect(records.map((record) => record.name)).toEqual([
			"Ada Example",
			"Zoe Example",
		]);
		expect(records[1]).toMatchObject({
			email: null,
			company: "Example Co",
			fields: {},
		});
	});

	it("requires the workspace on every read, update, and delete", async () => {
		const created = await createClientCommand(mutationContext("tenant-1"), {
			name: "Tenant Safe",
			email: "safe@example.com",
		});
		const recordId =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		expect(await getClientRecord(otherWorkspaceId, recordId)).toBeUndefined();
		// A command refuses a cross-tenant write outright rather than silently
		// matching no rows.
		await expect(
			updateClientCommand(otherContext("tenant-2"), recordId, {
				name: "Cross-tenant overwrite",
			}),
		).rejects.toThrow();
		await expect(
			deleteClientCommand(otherContext("tenant-3"), recordId),
		).rejects.toThrow();
		expect(await getClientRecord(workspaceId, recordId)).toMatchObject({
			name: "Tenant Safe",
		});
	});

	it("updates and deletes only the intended workspace record", async () => {
		const created = await createClientCommand(mutationContext("edit-1"), {
			name: "Before",
		});
		const recordId =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		const updated = await updateClientCommand(
			mutationContext("edit-2"),
			recordId,
			{ name: "After", notes: "Known client" },
		);
		expect(updated).toMatchObject({
			kind: "success",
			result: { name: "After", notes: "Known client" },
		});

		await expect(
			deleteClientCommand(mutationContext("edit-3"), recordId),
		).resolves.toMatchObject({ kind: "success" });
		expect(await getClientRecord(workspaceId, recordId)).toBeUndefined();
	});

	it("rejects invalid or unbounded client data", async () => {
		await expect(
			createClientCommand(mutationContext("bad-1"), {
				name: "",
				email: "not-an-email",
			}),
		).rejects.toThrow();
		await expect(
			createClientCommand(mutationContext("bad-2"), {
				name: "Too many fields",
				fields: Object.fromEntries(
					Array.from({ length: 51 }, (_, index) => [`field-${index}`, "value"]),
				),
			}),
		).rejects.toThrow("at most 50 custom fields");
	});
});

describe("Client Records domain events", () => {
	// Events are now committed to the outbox inside the same transaction as the
	// write, so this reads the durable record rather than subscribing to a bus.
	const emitted = async (workspace = workspaceId) =>
		db
			.select()
			.from(apiOutboxEvents)
			.where(eq(apiOutboxEvents.workspaceId, workspace))
			.orderBy(asc(apiOutboxEvents.occurredAt));

	it("records created / updated / deleted with aggregateId + actor", async () => {
		const created = await createClientCommand(mutationContext("evt-create"), {
			name: "Event Source",
		});
		const recordId =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		await updateClientCommand(mutationContext("evt-update"), recordId, {
			name: "Renamed",
		});
		await deleteClientCommand(mutationContext("evt-delete"), recordId);

		const events = await emitted();
		expect(events.map((e) => e.eventName)).toEqual([
			"client.created",
			"client.updated",
			"client.deleted",
		]);
		for (const event of events) {
			expect(event).toMatchObject({
				workspaceId,
				aggregateId: recordId,
				aggregateType: "client",
				// The actor rides on the event, so a dispatcher never joins back to
				// the mutation ledger to learn who caused it.
				actorId: ownerId,
				actorType: "user",
				publishedAt: null,
			});
		}
	});

	it("records nothing when a write touches no row in the workspace", async () => {
		const created = await createClientCommand(mutationContext("evt-owned"), {
			name: "Owned",
		});
		const recordId =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		// Wrong workspace → no row matched → the transaction rolls back, taking any
		// would-be event with it. That atomicity is the point of the outbox.
		await expect(
			updateClientCommand(otherContext("evt-cross-update"), recordId, {
				name: "Nope",
			}),
		).rejects.toThrow();
		await expect(
			deleteClientCommand(otherContext("evt-cross-delete"), recordId),
		).rejects.toThrow();

		expect(await emitted(otherWorkspaceId)).toEqual([]);
		expect((await emitted()).map((e) => e.eventName)).toEqual([
			"client.created",
		]);
	});
});
