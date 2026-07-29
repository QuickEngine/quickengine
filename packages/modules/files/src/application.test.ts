import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createFileFolderCommand,
	deleteFileFolderCommand,
	getFileDocumentDto,
	listFileFoldersPage,
	requestFileDocumentDeletionCommand,
	setFileDocumentStatusCommand,
	updateFileFolderCommand,
} from "./application";

const userId = "files-app-user";
const orgId = "00000000-0000-4000-8000-000000001a02";
const workspaceId = "00000000-0000-4000-8000-000000001a01";
const documentId = "00000000-0000-4000-8000-000000001a03";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: userId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: orgId,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const idOf = (result: { kind: string; result?: unknown }) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

/** Records what was enqueued so the post-commit ordering can be asserted. */
function recordingQueue() {
	const enqueued: Array<{ name: string; idempotencyKey?: string }> = [];
	return {
		enqueued,
		queue: {
			enqueue: async (job: { name: string; idempotencyKey?: string }) => {
				enqueued.push(job);
			},
		} as never,
	};
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		INSERT INTO quickengine_users (id, name, email, email_verified)
		VALUES (${userId}, 'Files User', 'files-app@example.com', true)
	`;
	await sql`
		INSERT INTO quickengine_organizations (id, name, slug, is_personal, owner_id)
		VALUES (${orgId}, 'Files Org', 'files-app-org', false, ${userId})
	`;
	await sql`
		INSERT INTO quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		VALUES (${workspaceId}, ${userId}, ${orgId}, 'Files Workspace', 'freelancer')
	`;
	await sql`
		INSERT INTO file_documents (id, workspace_id, title, status)
		VALUES (${documentId}, ${workspaceId}, 'Agreement', 'active')
	`;
});

describe("Files durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createFileFolderCommand(
			context("files.folder.create", "fil-1"),
			{ name: "Contracts" },
		);
		const replay = await createFileFolderCommand(
			context("files.folder.create", "fil-1"),
			{ name: "Contracts" },
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
				(select count(*)::int from file_folders where workspace_id = ${workspaceId}) folders,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			folders: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createFileFolderCommand(context("files.folder.create", "fil-2"), {
			name: "First",
		});
		const conflict = await createFileFolderCommand(
			context("files.folder.create", "fil-2", "different"),
			{ name: "Second" },
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("reports a duplicate root folder name as a conflict", async () => {
		await createFileFolderCommand(
			context("files.folder.create", "fil-root-1"),
			{ name: "TestEngine" },
		);

		await expect(
			createFileFolderCommand(context("files.folder.create", "fil-root-2"), {
				name: " testengine ",
			}),
		).rejects.toThrow(
			"A folder with that name already exists in this location.",
		);
	});

	it("reports a duplicate child folder name as a conflict", async () => {
		const parentId = idOf(
			await createFileFolderCommand(
				context("files.folder.create", "fil-parent"),
				{ name: "Parent" },
			),
		);
		await createFileFolderCommand(
			context("files.folder.create", "fil-child-1"),
			{ name: "Receipts", parentId },
		);

		await expect(
			createFileFolderCommand(context("files.folder.create", "fil-child-2"), {
				name: "RECEIPTS",
				parentId,
			}),
		).rejects.toThrow(
			"A folder with that name already exists in this location.",
		);
	});

	it("refuses to delete a folder that still has subfolders", async () => {
		const parent = idOf(
			await createFileFolderCommand(context("files.folder.create", "fil-3a"), {
				name: "Parent",
			}),
		);
		await createFileFolderCommand(context("files.folder.create", "fil-3b"), {
			name: "Child",
			parentId: parent,
		});

		await expect(
			deleteFileFolderCommand(
				context("files.folder.delete", "fil-3-del"),
				parent,
			),
		).rejects.toThrow(/still has subfolders/);
	});

	it("refuses to move a folder inside itself", async () => {
		const folder = idOf(
			await createFileFolderCommand(context("files.folder.create", "fil-4"), {
				name: "Self",
			}),
		);

		await expect(
			updateFileFolderCommand(
				context("files.folder.update", "fil-4-move"),
				folder,
				{
					name: "Self",
					parentId: folder,
				},
			),
		).rejects.toThrow(/can't be moved inside itself/);
	});

	it("lists only root folders when asked", async () => {
		const parent = idOf(
			await createFileFolderCommand(context("files.folder.create", "fil-5a"), {
				name: "Root",
			}),
		);
		await createFileFolderCommand(context("files.folder.create", "fil-5b"), {
			name: "Nested",
			parentId: parent,
		});

		const roots = await listFileFoldersPage(workspaceId, { rootOnly: true });
		expect(roots.items).toHaveLength(1);
		expect(roots.items[0]).toMatchObject({ name: "Root" });
	});

	it("requires a document to be trashed before it can be deleted", async () => {
		const { enqueued, queue } = recordingQueue();

		// active -> deleting is not a legal transition; trash is the deliberate safety step.
		await expect(
			requestFileDocumentDeletionCommand(
				context("files.document.delete", "fil-6a"),
				documentId,
				queue,
			),
		).rejects.toThrow(/status change isn't allowed/);
		expect(enqueued).toHaveLength(0);
	});

	// Storage cleanup is an external side effect: it must only be scheduled once the deletion
	// request has actually committed, and never for work that rolled back.
	it("queues storage cleanup only after the deletion request commits", async () => {
		const { enqueued, queue } = recordingQueue();
		await setFileDocumentStatusCommand(
			context("files.document.status", "fil-6-trash"),
			documentId,
			"trashed",
		);

		const outcome = await requestFileDocumentDeletionCommand(
			context("files.document.delete", "fil-6"),
			documentId,
			queue,
		);

		expect(outcome).toMatchObject({ kind: "success", status: 200 });
		expect(enqueued).toHaveLength(1);
		expect(enqueued[0]).toMatchObject({
			name: "storage.cleanup",
			idempotencyKey: `file-document-delete:${documentId}`,
		});

		const sql = testDbClient();
		const [row] = await sql`
			select status from file_documents where id = ${documentId}
		`;
		expect(row).toMatchObject({ status: "deleting" });
	});

	it("does not queue cleanup when the document does not exist", async () => {
		const { enqueued, queue } = recordingQueue();

		await expect(
			requestFileDocumentDeletionCommand(
				context("files.document.delete", "fil-7"),
				"00000000-0000-4000-8000-000000001aff",
				queue,
			),
		).rejects.toThrow(/document was not found/);
		expect(enqueued).toHaveLength(0);
	});

	it("omits storage addressing from returned versions", async () => {
		await setFileDocumentStatusCommand(
			context("files.document.status", "fil-8"),
			documentId,
			"archived",
		);
		const dto = await getFileDocumentDto(workspaceId, documentId);
		expect(dto).toMatchObject({ status: "archived" });
		expect(JSON.stringify(dto)).not.toMatch(/storageKey|storage_key/);
	});
});
