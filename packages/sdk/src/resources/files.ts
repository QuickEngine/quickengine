import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickDocument,
	QuickDocumentInput,
	QuickDocumentStatus,
	QuickFileAttachment,
	QuickFileFolder,
	QuickFileFolderInput,
	QuickFileVersion,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's documents. Reached as `quick.files`.
 *
 * Covers folders and document records. **Uploading is not part of this resource** — putting bytes
 * in storage is a separate reserve/upload/finalize flow that goes direct to storage rather than
 * through the API, so a failed transfer can never leave a half-written record behind.
 *
 * Documents are deleted in two deliberate steps: trash first, then request deletion. Storage
 * cleanup happens afterwards, and internal storage addressing is never returned.
 */
export class FilesResource {
	constructor(private readonly client: QuickClient) {}

	/* Folders */

	listFolders(
		options: {
			cursor?: string;
			limit?: number;
			parentId?: string;
			/** Only top-level folders. Takes precedence over `parentId`. */
			rootOnly?: boolean;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickFileFolder>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.parentId) query.set("parentId", options.parentId);
		if (options.rootOnly) query.set("rootOnly", "true");
		return this.client.request(`/file-folders${query.size ? `?${query}` : ""}`);
	}
	createFolder(input: QuickFileFolderInput, idempotencyKey: string) {
		return this.client.request<QuickFileFolder>("/file-folders", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	/** Renames or moves a folder. A folder can never be moved inside itself. */
	updateFolder(
		id: string,
		patch: QuickFileFolderInput,
		idempotencyKey: string,
	) {
		return this.client.request<QuickFileFolder>(
			`/file-folders/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	/** Only an empty folder can be deleted. */
	deleteFolder(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/file-folders/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	/* Documents */

	list(
		options: {
			cursor?: string;
			limit?: number;
			folderId?: string;
			status?: QuickDocumentStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickDocument>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.folderId) query.set("folderId", options.folderId);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/documents${query.size ? `?${query}` : ""}`);
	}
	/** Returns the document with its version history. */
	get(id: string) {
		return this.client.request<QuickDocument>(
			`/documents/${encodeURIComponent(id)}`,
		);
	}
	update(id: string, patch: QuickDocumentInput, idempotencyKey: string) {
		return this.client.request<QuickDocument>(
			`/documents/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	/**
	 * Move a document between active, archived, and trashed. Permanent deletion is a separate
	 * durable operation so storage cleanup cannot be bypassed.
	 */
	setStatus(
		id: string,
		status: Exclude<QuickDocumentStatus, "deleting">,
		idempotencyKey: string,
	) {
		return this.client.request<QuickDocument>(
			`/documents/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	/**
	 * Permanently delete a trashed document. The API first commits the deletion request, then
	 * schedules version-byte cleanup and final row purging.
	 */
	delete(id: string, idempotencyKey: string) {
		return this.client.request<QuickDocument>(
			`/documents/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
	listAttachments(id: string) {
		return this.client.request<{ items: QuickFileAttachment[] }>(
			`/documents/${encodeURIComponent(id)}/attachments`,
		);
	}

	/* Versions and attachments */

	/** Release a version held in quarantine so it can be used. */
	releaseVersion(versionId: string, idempotencyKey: string) {
		return this.client.request<QuickFileVersion>(
			`/file-versions/${encodeURIComponent(versionId)}/release`,
			{ method: "POST", idempotencyKey },
		);
	}
	removeAttachment(attachmentId: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/file-attachments/${encodeURIComponent(attachmentId)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
