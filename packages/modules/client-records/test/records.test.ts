import { testDbClient } from "@quickengine/db/testing";
import { type DomainEvent, getEventBus } from "@quickengine/events";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createClientCommand,
	createClientRecord,
	deleteClientRecord,
	getClientRecord,
	listClientRecords,
	updateClientRecord,
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
		await createClientRecord(workspaceId, {
			name: "  Zoe Example  ",
			email: "",
			company: "  Example Co  ",
		});
		await createClientRecord(workspaceId, {
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
		const record = await createClientRecord(workspaceId, {
			name: "Tenant Safe",
			email: "safe@example.com",
		});

		expect(await getClientRecord(otherWorkspaceId, record.id)).toBeUndefined();
		expect(
			await updateClientRecord(otherWorkspaceId, record.id, {
				name: "Cross-tenant overwrite",
			}),
		).toBeUndefined();
		expect(
			await deleteClientRecord(otherWorkspaceId, record.id),
		).toBeUndefined();
		expect(await getClientRecord(workspaceId, record.id)).toMatchObject({
			name: "Tenant Safe",
		});
	});

	it("updates and deletes only the intended workspace record", async () => {
		const record = await createClientRecord(workspaceId, { name: "Before" });
		expect(
			await updateClientRecord(workspaceId, record.id, {
				name: "After",
				notes: "Known client",
			}),
		).toMatchObject({ name: "After", notes: "Known client" });
		expect(await deleteClientRecord(workspaceId, record.id)).toEqual({
			id: record.id,
		});
		expect(await getClientRecord(workspaceId, record.id)).toBeUndefined();
	});

	it("rejects invalid or unbounded client data", async () => {
		await expect(
			createClientRecord(workspaceId, { name: "", email: "not-an-email" }),
		).rejects.toThrow();
		await expect(
			createClientRecord(workspaceId, {
				name: "Too many fields",
				fields: Object.fromEntries(
					Array.from({ length: 51 }, (_, index) => [`field-${index}`, "value"]),
				),
			}),
		).rejects.toThrow("at most 50 custom fields");
	});
});

describe("Client Records domain events", () => {
	// Capture whatever the module emits through the process-wide bus for the duration
	// of a single test, then unsubscribe so the singleton doesn't leak across tests.
	async function capture(run: () => Promise<void>): Promise<DomainEvent[]> {
		const events: DomainEvent[] = [];
		const unsubscribe = getEventBus().subscribe((event) => {
			events.push(event);
		});
		try {
			await run();
		} finally {
			unsubscribe();
		}
		return events;
	}

	it("emits created / updated / deleted with recordId + actor", async () => {
		let recordId = "";

		const created = await capture(async () => {
			const record = await createClientRecord(
				workspaceId,
				{ name: "Event Source" },
				{ actorId: ownerId },
			);
			recordId = record.id;
		});
		expect(created).toEqual([
			expect.objectContaining({
				workspaceId,
				name: "client_records.record.created",
				recordId,
				actorId: ownerId,
			}),
		]);

		const updated = await capture(async () => {
			await updateClientRecord(
				workspaceId,
				recordId,
				{ name: "Renamed" },
				{ actorId: ownerId },
			);
		});
		expect(updated).toEqual([
			expect.objectContaining({
				name: "client_records.record.updated",
				recordId,
				actorId: ownerId,
			}),
		]);

		const deleted = await capture(async () => {
			await deleteClientRecord(workspaceId, recordId, { actorId: ownerId });
		});
		expect(deleted).toEqual([
			expect.objectContaining({
				name: "client_records.record.deleted",
				recordId,
				actorId: ownerId,
			}),
		]);
	});

	it("does not emit when a write touches no row in the workspace", async () => {
		const record = await createClientRecord(workspaceId, { name: "Owned" });

		const events = await capture(async () => {
			// Wrong workspace → no row updated/deleted → no event.
			await updateClientRecord(otherWorkspaceId, record.id, { name: "Nope" });
			await deleteClientRecord(otherWorkspaceId, record.id);
		});
		expect(events).toEqual([]);
	});
});
