import { checkAllowance, meter } from "@quickengine/billing";
import {
	and,
	asc,
	db,
	desc,
	eq,
	fileAttachments,
	fileDocuments,
	fileFolders,
	fileVersions,
	inArray,
	isNull,
	max,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import type { JobQueue } from "@quickengine/jobs";
import type {
	PutObjectInput,
	StorageObjectLocator,
	StorageProvider,
} from "@quickengine/storage";
import {
	type FileAttachmentInput,
	fileAttachmentInputSchema,
	resolveAttachmentVersionId,
} from "./attachment";
import {
	canTransitionDocument,
	classifyFileContentType,
	type DocumentInput,
	type DocumentStatus,
	documentInputSchema,
	type FileVersionInput,
	fileVersionInputSchema,
} from "./document";
import { type FolderInput, folderInputSchema } from "./folder";

type QueryExecutor = Pick<typeof db, "select">;
export type FileTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];
export type StorageProviderResolver = (
	name: string,
) => StorageProvider | undefined;
export type UploadBody = PutObjectInput["body"];

const normalizeFolderName = (name: string) => name.toLowerCase();

async function getWorkspace(
	executor: QueryExecutor,
	workspaceId: string,
	lock = false,
	allowArchived = false,
) {
	const query = executor
		.select({
			id: quickengineWorkspaces.id,
			ownerId: quickengineWorkspaces.ownerId,
			archivedAt: quickengineWorkspaces.archivedAt,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	const [workspace] = lock ? await query.for("update") : await query;
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
	if (workspace.archivedAt && !allowArchived)
		throw new Error("WORKSPACE_ARCHIVED");
	return workspace;
}

async function assertFolder(
	executor: QueryExecutor,
	workspaceId: string,
	folderId: string | null,
) {
	if (!folderId) return;
	const [folder] = await executor
		.select({ workspaceId: fileFolders.workspaceId })
		.from(fileFolders)
		.where(eq(fileFolders.id, folderId))
		.limit(1)
		.for("update");
	if (!folder) throw new Error("FILE_FOLDER_NOT_FOUND");
	if (folder.workspaceId !== workspaceId) {
		throw new Error("FILE_FOLDER_WORKSPACE_MISMATCH");
	}
}

async function assertFolderParent(
	executor: QueryExecutor,
	workspaceId: string,
	parentId: string | null,
	folderId?: string,
) {
	if (!parentId) return;
	const seen = new Set(folderId ? [folderId] : []);
	let cursor: string | null = parentId;
	while (cursor) {
		if (seen.has(cursor)) throw new Error("FILE_FOLDER_PARENT_CYCLE");
		seen.add(cursor);
		const [parent]: Array<{ workspaceId: string; parentId: string | null }> =
			await executor
				.select({
					workspaceId: fileFolders.workspaceId,
					parentId: fileFolders.parentId,
				})
				.from(fileFolders)
				.where(eq(fileFolders.id, cursor))
				.limit(1)
				.for("update");
		if (!parent) throw new Error("FILE_FOLDER_NOT_FOUND");
		if (parent.workspaceId !== workspaceId) {
			throw new Error("FILE_FOLDER_WORKSPACE_MISMATCH");
		}
		cursor = parent.parentId;
	}
}

async function getDocumentReference(
	executor: QueryExecutor,
	workspaceId: string,
	documentId: string,
) {
	const [document] = await executor
		.select()
		.from(fileDocuments)
		.where(
			and(
				eq(fileDocuments.workspaceId, workspaceId),
				eq(fileDocuments.id, documentId),
			),
		)
		.limit(1)
		.for("update");
	if (!document) throw new Error("FILE_DOCUMENT_NOT_FOUND");
	return document;
}

export async function createFileFolder(
	workspaceId: string,
	input: FolderInput,
) {
	const parsed = folderInputSchema.parse(input);
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		await assertFolderParent(tx, workspaceId, parsed.parentId);
		const [created] = await tx
			.insert(fileFolders)
			.values({
				workspaceId,
				...parsed,
				normalizedName: normalizeFolderName(parsed.name),
			})
			.returning();
		return created;
	});
}

export async function listFileFolders(workspaceId: string) {
	return db
		.select()
		.from(fileFolders)
		.where(eq(fileFolders.workspaceId, workspaceId))
		.orderBy(asc(fileFolders.name));
}

export async function updateFileFolder(
	workspaceId: string,
	id: string,
	input: FolderInput,
) {
	const parsed = folderInputSchema.parse(input);
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const [current] = await tx
			.select({ id: fileFolders.id })
			.from(fileFolders)
			.where(
				and(eq(fileFolders.workspaceId, workspaceId), eq(fileFolders.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("FILE_FOLDER_NOT_FOUND");
		await assertFolderParent(tx, workspaceId, parsed.parentId, id);
		const [updated] = await tx
			.update(fileFolders)
			.set({
				...parsed,
				normalizedName: normalizeFolderName(parsed.name),
				updatedAt: new Date(),
			})
			.where(
				and(eq(fileFolders.workspaceId, workspaceId), eq(fileFolders.id, id)),
			)
			.returning();
		return updated;
	});
}

export async function deleteFileFolder(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const [current] = await tx
			.select({ id: fileFolders.id })
			.from(fileFolders)
			.where(
				and(eq(fileFolders.workspaceId, workspaceId), eq(fileFolders.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("FILE_FOLDER_NOT_FOUND");
		const [child] = await tx
			.select({ id: fileFolders.id })
			.from(fileFolders)
			.where(eq(fileFolders.parentId, id))
			.limit(1);
		if (child) throw new Error("FILE_FOLDER_HAS_CHILDREN");
		const [document] = await tx
			.select({ id: fileDocuments.id })
			.from(fileDocuments)
			.where(eq(fileDocuments.folderId, id))
			.limit(1);
		if (document) throw new Error("FILE_FOLDER_HAS_DOCUMENTS");
		const [deleted] = await tx
			.delete(fileFolders)
			.where(
				and(eq(fileFolders.workspaceId, workspaceId), eq(fileFolders.id, id)),
			)
			.returning();
		return deleted;
	});
}

async function accountStorageBytes(ownerId: string): Promise<number> {
	const [result] = await db
		.select({
			value: sql<string>`coalesce(sum(${fileVersions.sizeBytes}), 0)::bigint`,
		})
		.from(fileVersions)
		.innerJoin(
			quickengineWorkspaces,
			eq(quickengineWorkspaces.id, fileVersions.workspaceId),
		)
		.where(
			and(
				eq(quickengineWorkspaces.ownerId, ownerId),
				inArray(fileVersions.status, ["available", "quarantined"]),
			),
		);
	const total = Number(result?.value ?? 0);
	if (!Number.isSafeInteger(total) || total < 0) {
		throw new Error("FILE_STORAGE_TOTAL_INVALID");
	}
	return total;
}

export async function syncAccountFileStorageUsage(ownerId: string) {
	const total = await accountStorageBytes(ownerId);
	await meter({ scopeId: ownerId, meter: "storageBytes", amount: total });
	return total;
}

async function assertStorageUploadAllowed(
	ownerId: string,
	incomingBytes: number,
) {
	const total = await syncAccountFileStorageUsage(ownerId);
	const proposedTotal = total + incomingBytes;
	if (!Number.isSafeInteger(proposedTotal)) {
		throw new Error("FILE_STORAGE_TOTAL_INVALID");
	}
	const gate = await checkAllowance({
		scopeId: ownerId,
		meter: "storageBytes",
		amount: proposedTotal,
	});
	if (!gate.allowed) throw new Error("FILE_STORAGE_LIMIT_EXCEEDED");
	return gate;
}

function storageKey(
	workspaceId: string,
	documentId: string,
	versionId: string,
) {
	return `${workspaceId}/${documentId}/${versionId}`;
}

function locatorFor(version: {
	storageProvider: string;
	storageBucket: string;
	storageKey: string;
}): StorageObjectLocator {
	if (version.storageBucket !== "documents") {
		throw new Error("FILE_STORAGE_BUCKET_INVALID");
	}
	return {
		provider: version.storageProvider,
		bucket: "documents",
		key: version.storageKey,
	};
}

function uploadFailureReason(reason: "write" | "mismatch") {
	return reason === "write" ? "STORAGE_WRITE_FAILED" : "STORAGE_WRITE_MISMATCH";
}

async function failReservedVersion(
	workspaceId: string,
	versionId: string,
	reason: "write" | "mismatch",
) {
	await db
		.update(fileVersions)
		.set({
			status: "failed",
			failureReason: uploadFailureReason(reason),
			failedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.id, versionId),
				eq(fileVersions.status, "pending"),
			),
		);
}

async function storeReservedVersion(
	workspaceId: string,
	versionId: string,
	body: UploadBody,
	provider: StorageProvider,
	quarantine: boolean,
) {
	const [reserved] = await db
		.select()
		.from(fileVersions)
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.id, versionId),
				eq(fileVersions.status, "pending"),
			),
		)
		.limit(1);
	if (!reserved) throw new Error("FILE_VERSION_NOT_PENDING");
	let stored: Awaited<ReturnType<StorageProvider["put"]>>;
	try {
		stored = await provider.put({
			bucket: "documents",
			key: reserved.storageKey,
			body,
			contentType: reserved.contentType,
			metadata: {
				documentId: reserved.documentId,
				versionId: reserved.id,
				checksumSha256: reserved.checksumSha256,
			},
		});
	} catch {
		await failReservedVersion(workspaceId, versionId, "write");
		throw new Error("FILE_STORAGE_WRITE_FAILED");
	}
	const matches =
		stored.provider === reserved.storageProvider &&
		stored.bucket === reserved.storageBucket &&
		stored.key === reserved.storageKey &&
		stored.size === reserved.sizeBytes &&
		stored.checksumSha256 === reserved.checksumSha256;
	if (!matches) {
		try {
			await provider.delete(stored);
		} finally {
			await failReservedVersion(workspaceId, versionId, "mismatch");
		}
		throw new Error("FILE_STORAGE_WRITE_MISMATCH");
	}

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(fileVersions)
			.where(
				and(
					eq(fileVersions.workspaceId, workspaceId),
					eq(fileVersions.id, versionId),
				),
			)
			.limit(1)
			.for("update");
		if (current?.status !== "pending") {
			throw new Error("FILE_VERSION_CONCURRENT_UPDATE");
		}
		const now = new Date();
		const [updated] = await tx
			.update(fileVersions)
			.set({
				status: quarantine ? "quarantined" : "available",
				availableAt: quarantine ? null : now,
				quarantinedAt: quarantine ? now : null,
				failureReason: null,
				failedAt: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileVersions.workspaceId, workspaceId),
					eq(fileVersions.id, versionId),
					eq(fileVersions.status, "pending"),
				),
			)
			.returning();
		if (!updated) throw new Error("FILE_VERSION_CONCURRENT_UPDATE");
		if (!quarantine) {
			const document = await getDocumentReference(
				tx,
				workspaceId,
				current.documentId,
			);
			if (
				document.currentVersionNumber === null ||
				current.versionNumber > document.currentVersionNumber
			) {
				await tx
					.update(fileDocuments)
					.set({
						currentVersionNumber: current.versionNumber,
						updatedAt: now,
					})
					.where(eq(fileDocuments.id, current.documentId));
			}
		}
		return updated;
	});
}

export async function createFileDocument(
	workspaceId: string,
	documentInput: DocumentInput,
	versionInput: FileVersionInput,
	body: UploadBody,
	provider: StorageProvider,
	options: { quarantine?: boolean } = {},
) {
	const document = documentInputSchema.parse(documentInput);
	const version = fileVersionInputSchema.parse(versionInput);
	const workspace = await getWorkspace(db, workspaceId);
	await assertStorageUploadAllowed(workspace.ownerId, version.sizeBytes);
	const documentId = crypto.randomUUID();
	const versionId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		await assertFolder(tx, workspaceId, document.folderId);
		await tx.insert(fileDocuments).values({
			id: documentId,
			workspaceId,
			...document,
		});
		await tx.insert(fileVersions).values({
			id: versionId,
			workspaceId,
			documentId,
			versionNumber: 1,
			status: "pending",
			storageProvider: provider.name,
			storageBucket: "documents",
			storageKey: storageKey(workspaceId, documentId, versionId),
			...version,
			category: classifyFileContentType(version.contentType),
		});
	});
	const storedVersion = await storeReservedVersion(
		workspaceId,
		versionId,
		body,
		provider,
		options.quarantine ?? false,
	);
	await syncAccountFileStorageUsage(workspace.ownerId);
	const createdDocument = await getFileDocument(workspaceId, documentId);
	return { document: createdDocument, version: storedVersion };
}

export async function addFileDocumentVersion(
	workspaceId: string,
	documentId: string,
	versionInput: FileVersionInput,
	body: UploadBody,
	provider: StorageProvider,
	options: { quarantine?: boolean } = {},
) {
	const version = fileVersionInputSchema.parse(versionInput);
	const workspace = await getWorkspace(db, workspaceId);
	await assertStorageUploadAllowed(workspace.ownerId, version.sizeBytes);
	const versionId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		const document = await getDocumentReference(tx, workspaceId, documentId);
		if (document.status !== "active") {
			throw new Error("FILE_DOCUMENT_NOT_EDITABLE");
		}
		const [{ value }] = await tx
			.select({ value: max(fileVersions.versionNumber) })
			.from(fileVersions)
			.where(eq(fileVersions.documentId, documentId));
		const versionNumber = (value ?? 0) + 1;
		await tx.insert(fileVersions).values({
			id: versionId,
			workspaceId,
			documentId,
			versionNumber,
			status: "pending",
			storageProvider: provider.name,
			storageBucket: "documents",
			storageKey: storageKey(workspaceId, documentId, versionId),
			...version,
			category: classifyFileContentType(version.contentType),
		});
	});
	const stored = await storeReservedVersion(
		workspaceId,
		versionId,
		body,
		provider,
		options.quarantine ?? false,
	);
	await syncAccountFileStorageUsage(workspace.ownerId);
	return stored;
}

export async function retryFailedFileVersion(
	workspaceId: string,
	versionId: string,
	body: UploadBody,
	provider: StorageProvider,
	options: { quarantine?: boolean } = {},
) {
	const workspace = await getWorkspace(db, workspaceId);
	const [candidate] = await db
		.select({ sizeBytes: fileVersions.sizeBytes })
		.from(fileVersions)
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.id, versionId),
			),
		)
		.limit(1);
	if (!candidate) throw new Error("FILE_VERSION_NOT_FOUND");
	await assertStorageUploadAllowed(workspace.ownerId, candidate.sizeBytes);
	await db.transaction(async (tx) => {
		const [version] = await tx
			.select()
			.from(fileVersions)
			.where(
				and(
					eq(fileVersions.workspaceId, workspaceId),
					eq(fileVersions.id, versionId),
				),
			)
			.limit(1)
			.for("update");
		if (!version) throw new Error("FILE_VERSION_NOT_FOUND");
		if (version.status !== "failed") {
			throw new Error("FILE_VERSION_NOT_RETRYABLE");
		}
		if (version.storageProvider !== provider.name) {
			throw new Error("FILE_STORAGE_PROVIDER_MISMATCH");
		}
		const document = await getDocumentReference(
			tx,
			workspaceId,
			version.documentId,
		);
		if (document.status !== "active") {
			throw new Error("FILE_DOCUMENT_NOT_EDITABLE");
		}
		await tx
			.update(fileVersions)
			.set({ status: "pending", failureReason: null, failedAt: null })
			.where(eq(fileVersions.id, versionId));
	});
	const stored = await storeReservedVersion(
		workspaceId,
		versionId,
		body,
		provider,
		options.quarantine ?? false,
	);
	await syncAccountFileStorageUsage(workspace.ownerId);
	return stored;
}

export async function releaseQuarantinedFileVersion(
	workspaceId: string,
	versionId: string,
) {
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const [version] = await tx
			.select()
			.from(fileVersions)
			.where(
				and(
					eq(fileVersions.workspaceId, workspaceId),
					eq(fileVersions.id, versionId),
				),
			)
			.limit(1)
			.for("update");
		if (!version) throw new Error("FILE_VERSION_NOT_FOUND");
		if (version.status !== "quarantined") {
			throw new Error("FILE_VERSION_NOT_QUARANTINED");
		}
		const document = await getDocumentReference(
			tx,
			workspaceId,
			version.documentId,
		);
		if (document.status === "trashed" || document.status === "deleting") {
			throw new Error("FILE_DOCUMENT_NOT_EDITABLE");
		}
		const now = new Date();
		const [released] = await tx
			.update(fileVersions)
			.set({
				status: "available",
				availableAt: now,
				quarantinedAt: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileVersions.id, versionId),
					eq(fileVersions.status, "quarantined"),
				),
			)
			.returning();
		if (!released) throw new Error("FILE_VERSION_CONCURRENT_UPDATE");
		if (
			document.currentVersionNumber === null ||
			version.versionNumber > document.currentVersionNumber
		) {
			await tx
				.update(fileDocuments)
				.set({ currentVersionNumber: version.versionNumber, updatedAt: now })
				.where(eq(fileDocuments.id, version.documentId));
		}
		return released;
	});
}

export async function listFileDocuments(
	workspaceId: string,
	options: {
		folderId?: string | null;
		includeArchived?: boolean;
		includeTrashed?: boolean;
	} = {},
) {
	const statuses: DocumentStatus[] = ["active"];
	if (options.includeArchived) statuses.push("archived");
	if (options.includeTrashed) statuses.push("trashed");
	const conditions = [
		eq(fileDocuments.workspaceId, workspaceId),
		inArray(fileDocuments.status, statuses),
	];
	if (options.folderId !== undefined) {
		conditions.push(
			options.folderId === null
				? isNull(fileDocuments.folderId)
				: eq(fileDocuments.folderId, options.folderId),
		);
	}
	return db
		.select()
		.from(fileDocuments)
		.where(and(...conditions))
		.orderBy(desc(fileDocuments.updatedAt));
}

export async function getFileDocument(workspaceId: string, documentId: string) {
	const [document] = await db
		.select()
		.from(fileDocuments)
		.where(
			and(
				eq(fileDocuments.workspaceId, workspaceId),
				eq(fileDocuments.id, documentId),
			),
		)
		.limit(1);
	if (!document) return undefined;
	const versions = await db
		.select()
		.from(fileVersions)
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.documentId, documentId),
			),
		)
		.orderBy(desc(fileVersions.versionNumber));
	return { ...document, versions };
}

export async function updateFileDocument(
	workspaceId: string,
	documentId: string,
	input: DocumentInput,
) {
	const parsed = documentInputSchema.parse(input);
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const current = await getDocumentReference(tx, workspaceId, documentId);
		if (current.status !== "active") {
			throw new Error("FILE_DOCUMENT_NOT_EDITABLE");
		}
		await assertFolder(tx, workspaceId, parsed.folderId);
		const [updated] = await tx
			.update(fileDocuments)
			.set({ ...parsed, updatedAt: new Date() })
			.where(
				and(
					eq(fileDocuments.workspaceId, workspaceId),
					eq(fileDocuments.id, documentId),
				),
			)
			.returning();
		return updated;
	});
}

export async function setFileDocumentStatus(
	workspaceId: string,
	documentId: string,
	status: DocumentStatus,
) {
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const current = await getDocumentReference(tx, workspaceId, documentId);
		if (current.status === status)
			throw new Error("FILE_DOCUMENT_STATUS_UNCHANGED");
		if (!canTransitionDocument(current.status, status)) {
			throw new Error("FILE_DOCUMENT_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const [updated] = await tx
			.update(fileDocuments)
			.set({
				status,
				archivedAt: status === "archived" ? now : null,
				trashedAt: status === "trashed" ? now : null,
				deletionRequestedAt: status === "deleting" ? now : null,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileDocuments.workspaceId, workspaceId),
					eq(fileDocuments.id, documentId),
					eq(fileDocuments.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("FILE_DOCUMENT_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function requestFileDocumentDeletion(
	workspaceId: string,
	documentId: string,
	queue: JobQueue,
) {
	const document = await db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const current = await getDocumentReference(tx, workspaceId, documentId);
		if (current.status === "deleting") return current;
		if (!canTransitionDocument(current.status, "deleting")) {
			throw new Error("FILE_DOCUMENT_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const [updated] = await tx
			.update(fileDocuments)
			.set({
				status: "deleting",
				archivedAt: null,
				trashedAt: null,
				deletionRequestedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(fileDocuments.workspaceId, workspaceId),
					eq(fileDocuments.id, documentId),
					eq(fileDocuments.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("FILE_DOCUMENT_CONCURRENT_UPDATE");
		return updated;
	});
	await queue.enqueue({
		name: "storage.cleanup",
		payload: { workspaceId, documentId },
		idempotencyKey: `file-document-delete:${documentId}`,
	});
	return document;
}

export async function purgeDeletingFileDocument(
	workspaceId: string,
	documentId: string,
	resolveProvider: StorageProviderResolver,
) {
	const [document] = await db
		.select()
		.from(fileDocuments)
		.where(
			and(
				eq(fileDocuments.workspaceId, workspaceId),
				eq(fileDocuments.id, documentId),
			),
		)
		.limit(1);
	if (!document) return false;
	const workspace = await getWorkspace(db, workspaceId, false, true);
	if (document.status !== "deleting") {
		throw new Error("FILE_DOCUMENT_NOT_DELETING");
	}
	const versions = await db
		.select()
		.from(fileVersions)
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.documentId, documentId),
			),
		)
		.orderBy(asc(fileVersions.versionNumber));
	for (const version of versions) {
		const provider = resolveProvider(version.storageProvider);
		if (!provider) throw new Error("FILE_STORAGE_PROVIDER_NOT_FOUND");
		await provider.delete(locatorFor(version));
	}
	const deleted = await db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(fileDocuments)
			.where(
				and(
					eq(fileDocuments.workspaceId, workspaceId),
					eq(fileDocuments.id, documentId),
				),
			)
			.limit(1)
			.for("update");
		if (!current) return false;
		if (current.status !== "deleting") {
			throw new Error("FILE_DOCUMENT_NOT_DELETING");
		}
		const [removed] = await tx
			.delete(fileDocuments)
			.where(
				and(
					eq(fileDocuments.workspaceId, workspaceId),
					eq(fileDocuments.id, documentId),
					eq(fileDocuments.status, "deleting"),
				),
			)
			.returning({ id: fileDocuments.id });
		return Boolean(removed);
	});
	await syncAccountFileStorageUsage(workspace.ownerId);
	return deleted;
}

export async function createFileDownloadAccess(
	workspaceId: string,
	documentId: string,
	versionId: string | null,
	resolveProvider: StorageProviderResolver,
	options: { expiresInSeconds?: number } = {},
) {
	const [document] = await db
		.select()
		.from(fileDocuments)
		.where(
			and(
				eq(fileDocuments.workspaceId, workspaceId),
				eq(fileDocuments.id, documentId),
			),
		)
		.limit(1);
	if (!document) throw new Error("FILE_DOCUMENT_NOT_FOUND");
	if (document.status === "trashed" || document.status === "deleting") {
		throw new Error("FILE_DOCUMENT_NOT_DOWNLOADABLE");
	}
	const conditions = [
		eq(fileVersions.workspaceId, workspaceId),
		eq(fileVersions.documentId, documentId),
		eq(fileVersions.status, "available"),
	];
	if (versionId) {
		conditions.push(eq(fileVersions.id, versionId));
	} else {
		if (document.currentVersionNumber === null) {
			throw new Error("FILE_DOCUMENT_HAS_NO_AVAILABLE_VERSION");
		}
		conditions.push(
			eq(fileVersions.versionNumber, document.currentVersionNumber),
		);
	}
	const [version] = await db
		.select()
		.from(fileVersions)
		.where(and(...conditions))
		.limit(1);
	if (!version) throw new Error("FILE_VERSION_NOT_FOUND");
	const provider = resolveProvider(version.storageProvider);
	if (!provider) throw new Error("FILE_STORAGE_PROVIDER_NOT_FOUND");
	const expiresInSeconds = options.expiresInSeconds ?? 300;
	if (expiresInSeconds < 30 || expiresInSeconds > 3_600) {
		throw new Error("FILE_DOWNLOAD_EXPIRY_INVALID");
	}
	return provider.createDownloadAccess(locatorFor(version), {
		expiresInSeconds,
	});
}

/**
 * Low-level attachment write for a target-owning module to call only after it
 * validates the target in this same transaction. Files stays dependency-free;
 * arbitrary public callers never receive an unchecked generic attach endpoint.
 */
export async function attachFileToValidatedTarget(
	tx: FileTransaction,
	workspaceId: string,
	input: FileAttachmentInput,
	defaultMode: "pinned" | "latest" = "pinned",
) {
	const parsed = fileAttachmentInputSchema.parse(input);
	await getWorkspace(tx, workspaceId, true);
	const document = await getDocumentReference(
		tx,
		workspaceId,
		parsed.documentId,
	);
	if (document.status !== "active") {
		throw new Error("FILE_DOCUMENT_NOT_ATTACHABLE");
	}
	if (document.currentVersionNumber === null) {
		throw new Error("FILE_DOCUMENT_HAS_NO_AVAILABLE_VERSION");
	}
	const [currentVersion] = await tx
		.select({ id: fileVersions.id })
		.from(fileVersions)
		.where(
			and(
				eq(fileVersions.workspaceId, workspaceId),
				eq(fileVersions.documentId, parsed.documentId),
				eq(fileVersions.versionNumber, document.currentVersionNumber),
				eq(fileVersions.status, "available"),
			),
		)
		.limit(1);
	if (!currentVersion) throw new Error("FILE_CURRENT_VERSION_INVALID");
	const versionId = resolveAttachmentVersionId(
		defaultMode,
		currentVersion.id,
		parsed.versionId,
	);
	if (versionId) {
		const [version] = await tx
			.select({ id: fileVersions.id })
			.from(fileVersions)
			.where(
				and(
					eq(fileVersions.workspaceId, workspaceId),
					eq(fileVersions.documentId, parsed.documentId),
					eq(fileVersions.id, versionId),
					eq(fileVersions.status, "available"),
				),
			)
			.limit(1);
		if (!version) throw new Error("FILE_ATTACHMENT_VERSION_INVALID");
	}
	const [created] = await tx
		.insert(fileAttachments)
		.values({ ...parsed, workspaceId, versionId })
		.returning();
	return created;
}

export async function listFileAttachmentsForTarget(
	workspaceId: string,
	target: Pick<
		FileAttachmentInput,
		"targetModuleId" | "targetRecordType" | "targetRecordId"
	>,
) {
	const parsed = fileAttachmentInputSchema
		.pick({
			documentId: true,
			targetModuleId: true,
			targetRecordType: true,
			targetRecordId: true,
		})
		.omit({ documentId: true })
		.parse(target);
	return db
		.select()
		.from(fileAttachments)
		.where(
			and(
				eq(fileAttachments.workspaceId, workspaceId),
				eq(fileAttachments.targetModuleId, parsed.targetModuleId),
				eq(fileAttachments.targetRecordType, parsed.targetRecordType),
				eq(fileAttachments.targetRecordId, parsed.targetRecordId),
			),
		)
		.orderBy(asc(fileAttachments.position), asc(fileAttachments.createdAt));
}

export async function removeFileAttachment(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		await getWorkspace(tx, workspaceId, true);
		const [deleted] = await tx
			.delete(fileAttachments)
			.where(
				and(
					eq(fileAttachments.workspaceId, workspaceId),
					eq(fileAttachments.id, id),
				),
			)
			.returning();
		if (!deleted) throw new Error("FILE_ATTACHMENT_NOT_FOUND");
		return deleted;
	});
}
