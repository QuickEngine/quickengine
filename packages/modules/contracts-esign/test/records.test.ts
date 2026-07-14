import { contractSigners, db, eq } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createContract,
	deleteDraftContract,
	getContract,
	reviseContract,
	sendContract,
	signContract,
	updateDraftContract,
	viewContractForSigning,
} from "../src";

const ownerId = "contracts-owner";
const otherOwnerId = "contracts-other-owner";
const workspaceId = "00000000-0000-4000-8000-000000000401";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000402";
const clientId = "00000000-0000-4000-8000-000000000403";
const otherClientId = "00000000-0000-4000-8000-000000000404";
const documentId = "00000000-0000-4000-8000-000000000405";
const fileVersionId = "00000000-0000-4000-8000-000000000406";
const otherDocumentId = "00000000-0000-4000-8000-000000000407";
const otherFileVersionId = "00000000-0000-4000-8000-000000000408";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values
			(${ownerId}, 'Contracts Owner', 'contracts@example.com', true),
			(${otherOwnerId}, 'Other Owner', 'contracts-other@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Contracts Workspace', 'agency'),
			(${otherWorkspaceId}, ${otherOwnerId}, 'Other Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values
			(${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines'),
			(${otherClientId}, ${otherWorkspaceId}, 'Grace Hopper', 'grace@example.com', 'Compilers Inc')
	`;
	await sql`
		insert into file_documents (id, workspace_id, title, status)
		values
			(${documentId}, ${workspaceId}, 'Agreement', 'active'),
			(${otherDocumentId}, ${otherWorkspaceId}, 'Other Agreement', 'active')
	`;
	await sql`
		insert into file_versions
			(id, workspace_id, document_id, version_number, status, storage_provider, storage_bucket, storage_key, original_name, content_type, category, size_bytes, checksum_sha256, available_at)
		values
			(${fileVersionId}, ${workspaceId}, ${documentId}, 1, 'available', 'vercel-blob', 'documents', 'contracts/agreement.pdf', 'agreement.pdf', 'application/pdf', 'pdf', 1024, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now()),
			(${otherFileVersionId}, ${otherWorkspaceId}, ${otherDocumentId}, 1, 'available', 'vercel-blob', 'documents', 'contracts/other.pdf', 'other.pdf', 'application/pdf', 'pdf', 1024, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now())
	`;
});

function contractInput(overrides: Record<string, unknown> = {}) {
	return {
		clientId,
		fileVersionId,
		title: "Website services agreement",
		effectiveOn: "2026-07-14",
		signers: [
			{ name: "Ada Lovelace", email: "ada@example.com", role: "Client" },
			{
				name: "Charles Babbage",
				email: "charles@example.com",
				role: "Witness",
			},
		],
		...overrides,
	};
}

describe("Contracts & E-sign persistence", () => {
	it("rejects cross-workspace references and keeps reads tenant-scoped", async () => {
		await expect(
			createContract(workspaceId, contractInput({ clientId: otherClientId })),
		).rejects.toThrow("CLIENT_WORKSPACE_MISMATCH");
		await expect(
			createContract(
				workspaceId,
				contractInput({ fileVersionId: otherFileVersionId }),
			),
		).rejects.toThrow("FILE_VERSION_WORKSPACE_MISMATCH");

		const created = await createContract(workspaceId, contractInput());
		expect(created).toMatchObject({
			number: "CTR-0001",
			clientName: "Ada Lovelace",
			fileChecksumSha256:
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});
		expect(await getContract(otherWorkspaceId, created.id)).toBeUndefined();
	});

	it("issues one-time signer tokens and completes only after every signer signs", async () => {
		const created = await createContract(workspaceId, contractInput());
		const now = new Date("2026-07-14T12:00:00.000Z");
		const sent = await sendContract(workspaceId, created.id, { now });
		expect(sent.invitations).toHaveLength(2);
		const stored = await db
			.select({ tokenHash: contractSigners.tokenHash })
			.from(contractSigners)
			.where(eq(contractSigners.contractId, created.id));
		expect(stored.every((signer) => signer.tokenHash?.length === 64)).toBe(
			true,
		);
		expect(
			stored.some((signer) => signer.tokenHash === sent.invitations[0].token),
		).toBe(false);

		const first = sent.invitations[0];
		await viewContractForSigning(first.token, { now });
		await signContract(
			first.token,
			{ typedName: "Ada Lovelace", consentAccepted: true },
			{ now },
		);
		expect((await getContract(workspaceId, created.id))?.status).toBe(
			"partially_signed",
		);
		await expect(
			signContract(first.token, {
				typedName: "Ada Lovelace",
				consentAccepted: true,
			}),
		).rejects.toThrow("SIGNING_TOKEN_INVALID");

		await signContract(
			sent.invitations[1].token,
			{ typedName: "Charles Babbage", consentAccepted: true },
			{ now },
		);
		const completed = await getContract(workspaceId, created.id);
		expect(completed?.status).toBe("completed");
		expect(completed?.auditEvents.map((event) => event.eventType)).toEqual([
			"contract.created",
			"contract.sent",
			"contract.viewed",
			"contract.signed",
			"contract.signed",
		]);
		await expect(
			updateDraftContract(workspaceId, created.id, contractInput()),
		).rejects.toThrow("CONTRACT_NOT_EDITABLE");
	});

	it("keeps presented history and only deletes drafts", async () => {
		const original = await createContract(workspaceId, contractInput());
		await sendContract(workspaceId, original.id, {
			now: new Date("2026-07-14T12:00:00.000Z"),
		});
		await expect(deleteDraftContract(workspaceId, original.id)).rejects.toThrow(
			"CONTRACT_NOT_DELETABLE",
		);
		const revision = await reviseContract(workspaceId, original.id);
		expect(revision).toMatchObject({
			number: "CTR-0001-R2",
			revision: 2,
			supersedesId: original.id,
			status: "draft",
		});
		await sendContract(workspaceId, revision.id, {
			now: new Date("2026-07-14T13:00:00.000Z"),
		});
		expect((await getContract(workspaceId, original.id))?.status).toBe(
			"superseded",
		);
	});
});
