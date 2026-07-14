import { checkLimit } from "@quickengine/billing";
import { db, eq, fileDocuments, fileVersions } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { createInMemoryJobQueue } from "@quickengine/jobs";
import {
	createLocalStorageProvider,
	type StorageProvider,
} from "@quickengine/storage";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addFileDocumentVersion,
	attachFileToValidatedTarget,
	createFileDocument,
	createFileDownloadAccess,
	createFileFolder,
	getFileDocument,
	listFileAttachmentsForTarget,
	purgeDeletingFileDocument,
	releaseQuarantinedFileVersion,
	requestFileDocumentDeletion,
	setFileDocumentStatus,
	updateFileFolder,
} from "../src/records";

const userId = "files-user";
const workspaceId = "00000000-0000-4000-8000-000000000101";
const targetId = "opaque-project-id";

async function sha256(body: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function uploadMetadata(name: string, body: string) {
	return {
		originalName: name,
		contentType: "text/plain",
		sizeBytes: new TextEncoder().encode(body).byteLength,
		checksumSha256: await sha256(body),
	};
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		INSERT INTO quickengine_users (id, name, email, email_verified)
		VALUES (${userId}, 'Files User', 'files@example.com', true)
	`;
	await sql`
		INSERT INTO quickengine_workspaces (id, owner_id, name, business_type)
		VALUES (${workspaceId}, ${userId}, 'Files Workspace', 'freelancer')
	`;
});

describe("files persistence", () => {
	it("stores immutable versions, pins attachments, and grants temporary reads", async () => {
		const provider = createLocalStorageProvider();
		const folder = await createFileFolder(workspaceId, { name: "Contracts" });
		const firstBody = "first contract";
		const created = await createFileDocument(
			workspaceId,
			{ title: "Client contract", folderId: folder.id, tags: ["Legal"] },
			await uploadMetadata("contract-v1.txt", firstBody),
			firstBody,
			provider,
		);
		expect(created.document).toMatchObject({
			status: "active",
			currentVersionNumber: 1,
		});
		expect(created.version).toMatchObject({
			status: "available",
			versionNumber: 1,
		});
		expect(
			(await checkLimit({ scopeId: userId, meter: "storageBytes" })).used,
		).toBe(firstBody.length);

		const attachment = await db.transaction((tx) =>
			attachFileToValidatedTarget(tx, workspaceId, {
				documentId: created.version.documentId,
				targetModuleId: "projects-tasks",
				targetRecordType: "project",
				targetRecordId: targetId,
				role: "deliverable",
			}),
		);
		expect(attachment.versionId).toBe(created.version.id);

		const secondBody = "second contract version";
		const second = await addFileDocumentVersion(
			workspaceId,
			created.version.documentId,
			await uploadMetadata("contract-v2.txt", secondBody),
			secondBody,
			provider,
		);
		expect(second.versionNumber).toBe(2);
		expect(
			(await getFileDocument(workspaceId, created.version.documentId))
				?.currentVersionNumber,
		).toBe(2);
		expect(
			(
				await listFileAttachmentsForTarget(workspaceId, {
					targetModuleId: "projects-tasks",
					targetRecordType: "project",
					targetRecordId: targetId,
				})
			)[0]?.versionId,
		).toBe(created.version.id);

		const access = await createFileDownloadAccess(
			workspaceId,
			created.version.documentId,
			null,
			(name) => (name === provider.name ? provider : undefined),
		);
		expect(access.url).toContain(second.id);
		expect(access.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("supports quarantine release and cycle-safe folders", async () => {
		const provider = createLocalStorageProvider();
		const parent = await createFileFolder(workspaceId, { name: "Parent" });
		const child = await createFileFolder(workspaceId, {
			name: "Child",
			parentId: parent.id,
		});
		await expect(
			updateFileFolder(workspaceId, parent.id, {
				name: "Parent",
				parentId: child.id,
			}),
		).rejects.toThrow("FILE_FOLDER_PARENT_CYCLE");

		const body = "quarantine me";
		const created = await createFileDocument(
			workspaceId,
			{ title: "Unscanned document" },
			await uploadMetadata("unscanned.txt", body),
			body,
			provider,
			{ quarantine: true },
		);
		expect(created.version.status).toBe("quarantined");
		expect(created.document?.currentVersionNumber).toBeNull();
		expect(
			(await checkLimit({ scopeId: userId, meter: "storageBytes" })).used,
		).toBe(body.length);
		await releaseQuarantinedFileVersion(workspaceId, created.version.id);
		expect(
			(await getFileDocument(workspaceId, created.version.documentId))
				?.currentVersionNumber,
		).toBe(1);
	});

	it("keeps failed writes auditable and purges stored bytes before metadata", async () => {
		const local = createLocalStorageProvider();
		const mismatchingProvider: StorageProvider = {
			...local,
			name: "mismatch",
			async put(input) {
				const stored = await local.put(input);
				return {
					...stored,
					provider: "mismatch",
					checksumSha256: "0".repeat(64),
				};
			},
		};
		const failedBody = "bad attestation";
		await expect(
			createFileDocument(
				workspaceId,
				{ title: "Failed file" },
				await uploadMetadata("failed.txt", failedBody),
				failedBody,
				mismatchingProvider,
			),
		).rejects.toThrow("FILE_STORAGE_WRITE_MISMATCH");
		const [failed] = await db
			.select()
			.from(fileVersions)
			.where(eq(fileVersions.status, "failed"));
		expect(failed?.failureReason).toBe("STORAGE_WRITE_MISMATCH");

		const body = "delete me";
		const created = await createFileDocument(
			workspaceId,
			{ title: "Disposable" },
			await uploadMetadata("delete.txt", body),
			body,
			local,
		);
		await setFileDocumentStatus(
			workspaceId,
			created.version.documentId,
			"trashed",
		);
		await requestFileDocumentDeletion(
			workspaceId,
			created.version.documentId,
			createInMemoryJobQueue(),
		);
		await expect(
			requestFileDocumentDeletion(
				workspaceId,
				created.version.documentId,
				createInMemoryJobQueue(),
			),
		).resolves.toMatchObject({ status: "deleting" });
		const purged = await purgeDeletingFileDocument(
			workspaceId,
			created.version.documentId,
			(name) =>
				name === local.name || name === mismatchingProvider.name
					? name === local.name
						? local
						: mismatchingProvider
					: undefined,
		);
		expect(purged).toBe(true);
		await expect(
			purgeDeletingFileDocument(
				workspaceId,
				created.version.documentId,
				(name) => (name === local.name ? local : undefined),
			),
		).resolves.toBe(false);
		expect(
			await db
				.select()
				.from(fileDocuments)
				.where(eq(fileDocuments.id, created.version.documentId)),
		).toHaveLength(0);
		expect(
			(await checkLimit({ scopeId: userId, meter: "storageBytes" })).used,
		).toBe(0);
	});
});
