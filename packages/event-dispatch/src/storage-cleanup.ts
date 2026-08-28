import { pruneStoredResponses } from "@quickengine/db";
import { inngest } from "@quickengine/jobs";
import {
	type FileDocumentDeletionCandidate,
	listFileDocumentsAwaitingPurge,
	purgeDeletingFileDocument,
	type StorageProviderResolver,
} from "@quickengine/mod-files";
import { resolveStorageProviderByName } from "@quickengine/storage";

/**
 * Free the bytes behind documents that were permanently deleted.
 *
 * 🔴 **Why this exists.** `requestFileDocumentDeletionCommand` moves a document
 * to `deleting` and enqueues `storage.cleanup`. **Nothing consumed that job**,
 * so every permanently deleted document sat in `deleting` forever. Three things
 * followed from it, all verified:
 *
 *  · Blob bytes were never freed, and `orgStorageBytes` counts versions that are
 *    `available` or `quarantined` — deletion never changes version status, so the
 *    storage meter never went down. A customer who deleted everything stayed at
 *    their cap permanently.
 *  · `file_documents.workspace_id` is `ON DELETE restrict`, so deleting a
 *    workspace that had ever held a file failed with a foreign-key violation and
 *    a 500.
 *  · `deleteUserAccount` refuses while any document row exists — including rows
 *    stuck in `deleting`. **Account deletion was permanently blocked** for anyone
 *    who had uploaded and then deleted a file. That is an erasure-request dead
 *    end, not a missing feature.
 *
 * **A cron, not an event handler.** The enqueue already exists and is harmless,
 * but a sweep also recovers documents stranded by the months this never ran, and
 * by any future enqueue that is lost. The work is idempotent — `purge` re-reads
 * status under a lock and provider deletes are required to be safe to repeat —
 * so doing it twice costs nothing.
 */

/**
 * The provider a stored version belongs to.
 *
 * 🔴 Resolved by the NAME recorded beside the object, never assumed. A workspace
 * holds versions written before the provider changed, and deleting with the
 * wrong one silently leaves the bytes behind — the storage bill keeps growing
 * for files everybody believes are gone.
 */
const resolveProvider: StorageProviderResolver = (name) =>
	resolveStorageProviderByName(
		name,
		process.env.QUICKDASH_ADMIN_URL ?? "http://localhost:3011",
	);

/** How many documents one cycle will purge. Bounded so a backlog cannot hold the worker. */
const BATCH = 25;

export async function purgePendingDocumentDeletions(options?: {
	batchSize?: number;
	resolve?: StorageProviderResolver;
}): Promise<{ purged: number; failed: number }> {
	const batchSize = options?.batchSize ?? BATCH;
	const resolve = options?.resolve ?? resolveProvider;

	const pending: FileDocumentDeletionCandidate[] =
		await listFileDocumentsAwaitingPurge(batchSize);

	let purged = 0;
	let failed = 0;
	for (const candidate of pending) {
		try {
			const done = await purgeDeletingFileDocument(
				candidate.workspaceId,
				candidate.id,
				resolve,
			);
			if (done) purged += 1;
		} catch {
			// One document with an unresolvable provider must not stop the rest —
			// otherwise a single bad row blocks every account deletion behind it.
			// The row stays in `deleting` and the next cycle tries again.
			failed += 1;
		}
	}
	return { purged, failed };
}

export const storageCleanup = inngest.createFunction(
	{
		id: "storage-cleanup",
		concurrency: 1,
		retries: 0, // Idempotent and swept on a schedule; a failed cycle just waits.
		triggers: [{ cron: "*/5 * * * *" }],
	},
	async () => purgePendingDocumentDeletions(),
);

/**
 * Drop stored mutation responses once they can no longer be replayed.
 *
 * Daily rather than every five minutes: nothing is urgent about it, and a
 * quieter schedule keeps the write load off the hour a customer is working.
 */
export const mutationRetention = inngest.createFunction(
	{
		id: "mutation-retention",
		concurrency: 1,
		retries: 0, // Bounded and idempotent; a missed day is caught by the next.
		triggers: [{ cron: "17 3 * * *" }],
	},
	async () => pruneStoredResponses(),
);
