import { testDbClient } from "@quickengine/db/testing";
import { purgePendingDocumentDeletions } from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "sc-owner";
const workspaceId = "00000000-0000-4000-8000-00000005c001";
const documentId = "00000000-0000-4000-8000-00000005c002";

/** A provider that records what it was asked to delete. */
const deleted: string[] = [];
const resolve = () => ({
	name: "local",
	async put() {
		throw new Error("unused");
	},
	async delete(locator: { key: string }) {
		deleted.push(locator.key);
	},
	async createDownloadAccess() {
		throw new Error("unused");
	},
});

beforeEach(async () => {
	deleted.length = 0;
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'SC Owner', 'sc@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'SC Workspace', 'agency')
	`;
	await sql`
		insert into file_documents (id, workspace_id, title, status, deletion_requested_at)
		values (${documentId}, ${workspaceId}, 'Contract', 'deleting', now())
	`;
	await sql`
		insert into file_versions
			(workspace_id, document_id, version_number, status, category, checksum_sha256, storage_provider, storage_bucket, storage_key, size_bytes, content_type, original_name)
		values (${workspaceId}, ${documentId}, 1, 'available', 'document', 'abc123', 'local', 'documents', 'ws/doc/v1', 1024, 'application/pdf', 'contract.pdf')
	`;
});

describe("storage cleanup", () => {
	/**
	 * 🔴 The bug this closes. `storage.cleanup` was enqueued and consumed by
	 * nothing, so every permanently deleted document sat in `deleting` forever —
	 * which kept its bytes counted against the storage meter, made workspace
	 * deletion fail on a foreign key, and blocked account deletion outright.
	 */
	it("frees the bytes and removes the row", async () => {
		const sql = testDbClient();

		const result = await purgePendingDocumentDeletions({
			resolve: resolve as never,
		});

		expect(result.purged).toBe(1);
		expect(deleted).toEqual(["ws/doc/v1"]);

		const rows = await sql`
			select id from file_documents where id = ${documentId}`;
		expect(rows).toHaveLength(0);
	});

	// Deleting a workspace fails on a foreign key while any document row exists,
	// so the purge has to actually remove rows for that path to work at all.
	it("leaves nothing behind that would block workspace deletion", async () => {
		const sql = testDbClient();
		await purgePendingDocumentDeletions({ resolve: resolve as never });

		const versions = await sql`
			select id from file_versions where document_id = ${documentId}`;
		expect(versions).toHaveLength(0);
	});

	// Safe to repeat: providers must tolerate a repeated delete, and a second
	// cycle must not throw on a row that is already gone.
	it("is idempotent across cycles", async () => {
		await purgePendingDocumentDeletions({ resolve: resolve as never });
		const second = await purgePendingDocumentDeletions({
			resolve: resolve as never,
		});
		expect(second.purged).toBe(0);
		expect(second.failed).toBe(0);
	});

	// One unresolvable provider must not stop the rest, or a single bad row
	// blocks every account deletion queued behind it.
	it("keeps going when one document cannot be resolved", async () => {
		const result = await purgePendingDocumentDeletions({
			resolve: (() => undefined) as never,
		});
		expect(result.failed).toBe(1);
		expect(result.purged).toBe(0);
	});
});
