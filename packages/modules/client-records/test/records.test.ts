import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createClientRecord,
	deleteClientRecord,
	getClientRecord,
	listClientRecords,
	updateClientRecord,
} from "../src";

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
