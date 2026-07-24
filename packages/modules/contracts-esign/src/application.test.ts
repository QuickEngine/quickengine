import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createContractCommand,
	deleteDraftContractCommand,
	getContractDto,
	sendContractCommand,
	voidContractCommand,
} from "./application";

const ownerId = "contracts-app-owner";
const workspaceId = "00000000-0000-4000-8000-0000000019a1";
const clientId = "00000000-0000-4000-8000-0000000019b1";
const documentId = "00000000-0000-4000-8000-0000000019c1";
const fileVersionId = "00000000-0000-4000-8000-0000000019d1";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const contractInput = (overrides: Record<string, unknown> = {}) => ({
	clientId,
	fileVersionId,
	title: "Website services agreement",
	signers: [
		{ name: "Ada Lovelace", email: "ada@example.com", role: "Client" },
		{ name: "Charles Babbage", email: "charles@example.com", role: "Witness" },
	],
	...overrides,
});

const idOf = (result: Awaited<ReturnType<typeof createContractCommand>>) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Contracts Owner', 'contracts-app@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Contracts Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com')
	`;
	await sql`
		insert into file_documents (id, workspace_id, title, status)
		values (${documentId}, ${workspaceId}, 'Agreement', 'active')
	`;
	await sql`
		insert into file_versions
			(id, workspace_id, document_id, version_number, status, storage_provider, storage_bucket, storage_key, original_name, content_type, category, size_bytes, checksum_sha256, available_at)
		values
			(${fileVersionId}, ${workspaceId}, ${documentId}, 1, 'available', 'vercel-blob', 'documents', 'contracts/agreement.pdf', 'agreement.pdf', 'application/pdf', 'pdf', 1024, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now())
	`;
});

describe("Contracts durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createContractCommand(
			context("contracts.create", "con-1"),
			contractInput(),
		);
		const replay = await createContractCommand(
			context("contracts.create", "con-1"),
			contractInput(),
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
				(select count(*)::int from contracts where workspace_id = ${workspaceId}) contracts,
				(select count(*)::int from contract_signers) signers,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		expect(counts).toMatchObject({
			contracts: 1,
			signers: 2,
			mutations: 1,
			audits: 1,
		});
	});

	// The security property this whole module is designed around.
	it("never lets a signing token reach the replayable result, audit, or outbox", async () => {
		const created = await createContractCommand(
			context("contracts.create", "con-2"),
			contractInput(),
		);
		const id = idOf(created);
		const sent = await sendContractCommand(
			context("contracts.send", "con-2-send"),
			id,
			{ actorId: ownerId },
		);

		expect(sent.kind).toBe("success");
		const result = sent.kind === "success" ? sent.result : {};
		// Invitation metadata is present, token material is not.
		expect(JSON.stringify(result)).not.toMatch(/token/i);
		expect((result as { invitations: unknown[] }).invitations).toHaveLength(2);

		const sql = testDbClient();
		// The persisted replay row and the audit/outbox trail must be token-free too — anyone
		// able to read these tables must not be able to sign on a party's behalf.
		const [rows] = await sql`
			select
				(select coalesce(string_agg(response_body::text, ' '), '') from api_mutations
					where workspace_id = ${workspaceId}) replay,
				(select coalesce(string_agg(metadata::text, ' '), '') from api_audit_events
					where workspace_id = ${workspaceId}) audit,
				(select coalesce(string_agg(payload::text, ' '), '') from api_outbox_events
					where workspace_id = ${workspaceId}) outbox
		`;
		expect(rows.replay).not.toMatch(/"token"/);
		expect(rows.audit).not.toMatch(/"token"/);
		expect(rows.outbox).not.toMatch(/"token"/);
	});

	it("get returns signers without their token hash", async () => {
		const created = await createContractCommand(
			context("contracts.create", "con-3"),
			contractInput(),
		);
		const dto = await getContractDto(workspaceId, idOf(created));
		expect(dto?.signers).toHaveLength(2);
		expect(JSON.stringify(dto)).not.toMatch(/tokenHash|token_hash/);
	});

	it("only deletes a draft contract", async () => {
		const created = await createContractCommand(
			context("contracts.create", "con-4"),
			contractInput(),
		);
		const id = idOf(created);
		await sendContractCommand(context("contracts.send", "con-4-send"), id, {
			actorId: ownerId,
		});

		await expect(
			deleteDraftContractCommand(context("contracts.delete", "con-4-del"), id),
		).rejects.toThrow(/Only a draft contract can be deleted/);
	});

	it("voids a contract instead of losing it", async () => {
		const created = await createContractCommand(
			context("contracts.create", "con-5"),
			contractInput(),
		);
		const id = idOf(created);
		await sendContractCommand(context("contracts.send", "con-5-send"), id, {
			actorId: ownerId,
		});

		const voided = await voidContractCommand(
			context("contracts.void", "con-5-void"),
			id,
		);
		expect(voided).toMatchObject({ kind: "success", status: 200 });
	});

	it("rolls the whole contract back when the client reference is invalid", async () => {
		await expect(
			createContractCommand(
				context("contracts.create", "con-6"),
				contractInput({ clientId: "00000000-0000-4000-8000-0000000019ff" }),
			),
		).rejects.toThrow(/client on this contract was not found/);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from contracts where workspace_id = ${workspaceId}) contracts,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		expect(counts).toMatchObject({ contracts: 0, audits: 0 });
	});
});
