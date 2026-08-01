import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction, SortMap } from "@quickengine/db";
import {
	afterCursor,
	and,
	asc,
	db,
	decodeCursor,
	eq,
	fileAttachments,
	fileDocuments,
	fileFolders,
	fileVersions,
	gt,
	isNull,
	mutationUnitOfWork,
	pageOrder,
	resolveSort,
	toPage,
} from "@quickengine/db";
import type { JobQueue } from "@quickengine/jobs";
import { z } from "zod";
import {
	DOCUMENT_STATUSES,
	type DocumentInput,
	type DocumentStatus,
} from "./document";
import type { FolderInput } from "./folder";
import {
	createFileFolderInTx,
	deleteFileFolderInTx,
	enqueueFileDocumentCleanup,
	isFileFolderNameConstraint,
	releaseQuarantinedFileVersionInTx,
	removeFileAttachmentInTx,
	requestFileDocumentDeletionInTx,
	setFileDocumentStatusInTx,
	updateFileDocumentInTx,
	updateFileFolderInTx,
} from "./records";

export type FilesMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const DOCUMENT_SORTS = {
	title: fileDocuments.title,
	status: fileDocuments.status,
	createdAt: fileDocuments.createdAt,
	updatedAt: fileDocuments.updatedAt,
} as const satisfies SortMap;

export const documentListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	folderId: z.uuid().optional(),
	status: z.enum(DOCUMENT_STATUSES).optional(),
});

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const FOLDER_SORTS = {
	name: fileFolders.name,
	createdAt: fileFolders.createdAt,
	updatedAt: fileFolders.updatedAt,
} as const satisfies SortMap;

export const folderListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	parentId: z.uuid().optional(),
	/** Only root-level folders. Takes precedence over `parentId`. */
	rootOnly: z.coerce.boolean().default(false),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	WORKSPACE_ARCHIVED: "This workspace is archived and can't take new files.",

	FILE_FOLDER_NOT_FOUND: "The folder was not found.",
	FILE_FOLDER_WORKSPACE_MISMATCH: "That folder belongs to another workspace.",
	FILE_FOLDER_PARENT_CYCLE: "A folder can't be moved inside itself.",
	FILE_FOLDER_HAS_CHILDREN:
		"This folder still has subfolders. Move or delete them first.",
	FILE_FOLDER_HAS_DOCUMENTS:
		"This folder still has documents. Move or delete them first.",
	FILE_FOLDER_NAME_CONFLICT:
		"A folder with that name already exists in this location.",

	FILE_DOCUMENT_NOT_FOUND: "The document was not found.",
	FILE_DOCUMENT_NOT_EDITABLE: "This document can no longer be edited.",
	FILE_DOCUMENT_ILLEGAL_TRANSITION:
		"That document status change isn't allowed.",
	FILE_DOCUMENT_STATUS_UNCHANGED: "The document is already in that status.",
	FILE_DOCUMENT_CONCURRENT_UPDATE:
		"The document changed while this update was in flight. Try again.",
	FILE_DOCUMENT_NOT_DELETING: "This document isn't scheduled for deletion.",
	FILE_DOCUMENT_NOT_DOWNLOADABLE: "This document can't be downloaded.",
	FILE_DOCUMENT_HAS_NO_AVAILABLE_VERSION:
		"This document has no version ready to download.",
	FILE_DOCUMENT_NOT_ATTACHABLE: "This document can't be attached.",

	FILE_VERSION_NOT_FOUND: "The file version was not found.",
	FILE_VERSION_NOT_PENDING: "That upload is no longer awaiting its file.",
	FILE_VERSION_NOT_QUARANTINED: "That version isn't quarantined.",
	FILE_VERSION_NOT_RETRYABLE: "That version can't be retried.",
	FILE_VERSION_CONCURRENT_UPDATE:
		"The version changed while this update was in flight. Try again.",
	FILE_CURRENT_VERSION_INVALID: "The document's current version is invalid.",

	FILE_ATTACHMENT_NOT_FOUND: "The attachment was not found.",
	FILE_ATTACHMENT_VERSION_INVALID:
		"That attachment points at an invalid version.",

	FILE_DOWNLOAD_EXPIRY_INVALID: "Check the download link's expiry window.",

	FILE_STORAGE_LIMIT_EXCEEDED:
		"This organization has reached its storage limit.",
	FILE_STORAGE_WRITE_FAILED:
		"The file couldn't be stored. Try uploading again.",
	FILE_STORAGE_WRITE_MISMATCH:
		"The stored file didn't match what was uploaded. Try again.",
	FILE_STORAGE_PROVIDER_NOT_FOUND: "The storage provider isn't configured.",
	FILE_STORAGE_PROVIDER_MISMATCH: "That file belongs to a different provider.",
	FILE_STORAGE_BUCKET_INVALID: "That storage bucket isn't valid.",
	FILE_STORAGE_TOTAL_INVALID: "The storage total couldn't be calculated.",
};

function mapFilesError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (isFileFolderNameConstraint(error)) {
		throw new DomainError("CONFLICT", FRIENDLY.FILE_FOLDER_NAME_CONFLICT);
	}
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/(MISMATCH|PARENT_CYCLE|_INVALID)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(ARCHIVED|HAS_CHILDREN|HAS_DOCUMENTS|NOT_EDITABLE|ILLEGAL_TRANSITION|STATUS_UNCHANGED|CONCURRENT_UPDATE|NOT_DELETING|NOT_DOWNLOADABLE|NO_AVAILABLE_VERSION|NOT_ATTACHABLE|NOT_PENDING|NOT_QUARANTINED|NOT_RETRYABLE|LIMIT_EXCEEDED|WRITE_FAILED|WRITE_MISMATCH)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeFolder = (row: typeof fileFolders.$inferSelect) =>
	serializeDates(row);
const serializeDocument = (row: typeof fileDocuments.$inferSelect) =>
	serializeDates(row);
/** Storage keys are internal addressing, not part of the public contract. */
const serializeVersion = ({
	storageKey: _storageKey,
	storageBucket: _storageBucket,
	...safe
}: typeof fileVersions.$inferSelect) => serializeDates(safe);
const serializeAttachment = (row: typeof fileAttachments.$inferSelect) =>
	serializeDates(row);

export type FileFolderDto = ReturnType<typeof serializeFolder>;
export type FileDocumentDto = ReturnType<typeof serializeDocument>;

export async function listFileFoldersPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		parentId?: string;
		rootOnly?: boolean | string;
	},
) {
	const page = folderListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(FOLDER_SORTS, page.sort, "name");
	const where = and(
		eq(fileFolders.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			fileFolders.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.rootOnly
			? isNull(fileFolders.parentId)
			: page.parentId
				? eq(fileFolders.parentId, page.parentId)
				: undefined,
	);
	const rows = await db
		.select()
		.from(fileFolders)
		.where(where)
		.orderBy(...pageOrder(sort.column, fileFolders.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeFolder),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function listFileDocumentsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		folderId?: string;
		status?: string;
	},
) {
	const page = documentListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(DOCUMENT_SORTS, page.sort, "createdAt");
	const where = and(
		eq(fileDocuments.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			fileDocuments.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.folderId ? eq(fileDocuments.folderId, page.folderId) : undefined,
		page.status ? eq(fileDocuments.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(fileDocuments)
		.where(where)
		.orderBy(...pageOrder(sort.column, fileDocuments.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeDocument),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

/** A document with its version history. Storage addressing is omitted from every version. */
export async function getFileDocumentDto(workspaceId: string, id: string) {
	const [document] = await db
		.select()
		.from(fileDocuments)
		.where(
			and(eq(fileDocuments.workspaceId, workspaceId), eq(fileDocuments.id, id)),
		)
		.limit(1);
	if (!document) return null;
	const versions = await db
		.select()
		.from(fileVersions)
		.where(eq(fileVersions.documentId, id))
		.orderBy(asc(fileVersions.versionNumber));
	return {
		...serializeDocument(document),
		versions: versions.map(serializeVersion),
	};
}

export async function listFileAttachmentsPage(
	workspaceId: string,
	documentId: string,
) {
	const rows = await db
		.select()
		.from(fileAttachments)
		.where(
			and(
				eq(fileAttachments.workspaceId, workspaceId),
				eq(fileAttachments.documentId, documentId),
			),
		)
		.orderBy(asc(fileAttachments.id));
	return { items: rows.map(serializeAttachment) };
}

/* ── Folders ──────────────────────────────────────────────────────────────── */

export function createFileFolderCommand(
	context: MutationExecutionContext,
	input: FolderInput,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FileFolderDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createFileFolderInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "file-folder.created",
				resourceId: row.id,
				resourceType: "file-folder",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-folder",
				eventName: "file-folder.created",
				payload: { folderId: row.id },
				version: 1,
			});
			return { result: serializeFolder(row), status: 201 };
		})
		.catch(mapFilesError);
}

export function updateFileFolderCommand(
	context: MutationExecutionContext,
	id: string,
	input: FolderInput,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FileFolderDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateFileFolderInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "file-folder.updated",
				resourceId: row.id,
				resourceType: "file-folder",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-folder",
				eventName: "file-folder.updated",
				payload: { folderId: row.id },
				version: 1,
			});
			return { result: serializeFolder(row), status: 200 };
		})
		.catch(mapFilesError);
}

export function deleteFileFolderCommand(
	context: MutationExecutionContext,
	id: string,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteFileFolderInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "file-folder.deleted",
				resourceId: row.id,
				resourceType: "file-folder",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-folder",
				eventName: "file-folder.deleted",
				payload: { folderId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapFilesError);
}

/* ── Documents ────────────────────────────────────────────────────────────── */

export function updateFileDocumentCommand(
	context: MutationExecutionContext,
	documentId: string,
	input: DocumentInput,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FileDocumentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateFileDocumentInTx(
				transaction.db,
				context.workspaceId,
				documentId,
				input,
			);
			await transaction.audit({
				action: "file-document.updated",
				resourceId: row.id,
				resourceType: "file-document",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-document",
				eventName: "file-document.updated",
				payload: { documentId: row.id },
				version: 1,
			});
			return { result: serializeDocument(row), status: 200 };
		})
		.catch(mapFilesError);
}

export function setFileDocumentStatusCommand(
	context: MutationExecutionContext,
	documentId: string,
	status: DocumentStatus,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FileDocumentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setFileDocumentStatusInTx(
				transaction.db,
				context.workspaceId,
				documentId,
				status,
			);
			await transaction.audit({
				action: "file-document.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "file-document",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-document",
				eventName: "file-document.status-changed",
				payload: { documentId: row.id, status },
				version: 1,
			});
			return { result: serializeDocument(row), status: 200 };
		})
		.catch(mapFilesError);
}

/**
 * Mark a document for deletion, then queue the storage cleanup.
 *
 * The row change and its evidence commit together; the queue enqueue happens **after** the
 * transaction commits, because it is an external side effect and must never run for work that
 * rolled back. The enqueue carries its own idempotency key, so an at-least-once retry of this
 * command cannot schedule two cleanups. Bytes are removed later by `purgeDeletingFileDocument`.
 */
export function requestFileDocumentDeletionCommand(
	context: MutationExecutionContext,
	documentId: string,
	queue: JobQueue,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<FileDocumentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await requestFileDocumentDeletionInTx(
				transaction.db,
				context.workspaceId,
				documentId,
			);
			await transaction.audit({
				action: "file-document.deletion-requested",
				resourceId: row.id,
				resourceType: "file-document",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-document",
				eventName: "file-document.deletion-requested",
				payload: { documentId: row.id },
				version: 1,
			});
			return { result: serializeDocument(row), status: 200 };
		})
		.then(async (outcome) => {
			// Only schedule cleanup once the deletion request is actually committed.
			if (outcome.kind === "success") {
				await enqueueFileDocumentCleanup(
					context.workspaceId,
					documentId,
					queue,
				);
			}
			return outcome;
		})
		.catch(mapFilesError);
}

/* ── Versions and attachments ─────────────────────────────────────────────── */

export function releaseQuarantinedFileVersionCommand(
	context: MutationExecutionContext,
	versionId: string,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
) {
	return uow
		.execute(context, async (transaction) => {
			const row = await releaseQuarantinedFileVersionInTx(
				transaction.db,
				context.workspaceId,
				versionId,
			);
			await transaction.audit({
				action: "file-version.released",
				resourceId: row.id,
				resourceType: "file-version",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-version",
				eventName: "file-version.released",
				payload: { documentId: row.documentId, versionId: row.id },
				version: 1,
			});
			return { result: serializeVersion(row), status: 200 };
		})
		.catch(mapFilesError);
}

export function removeFileAttachmentCommand(
	context: MutationExecutionContext,
	id: string,
	uow: FilesMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await removeFileAttachmentInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "file-attachment.removed",
				resourceId: row.id,
				resourceType: "file-attachment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "file-attachment",
				eventName: "file-attachment.removed",
				payload: { attachmentId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapFilesError);
}
