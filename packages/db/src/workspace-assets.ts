import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "./client";
import { workspaceAssets } from "./schema/files";

/**
 * Record a public asset so it counts toward storage.
 *
 * 🔴 Called by every upload path that writes to object storage. Storage was
 * only ever counted for the Files module, so product photographs and workspace
 * images filled a bucket we pay for while the customer's usage read zero.
 *
 * ⚠️ Upserts on the storage key. Uploading over an existing key REPLACES the
 * object rather than adding one, so counting it twice would inflate the gauge
 * permanently. The new size wins, because that is what is now stored.
 *
 * ⚠️ `sizeBytes` must come from the provider's own response, never from a
 * client-supplied length. Every provider returns it on write.
 */
export async function recordWorkspaceAsset(input: {
	workspaceId: string;
	kind: "catalog" | "workspace";
	key: string;
	url: string;
	sizeBytes: number;
	contentType?: string;
}): Promise<void> {
	await db
		.insert(workspaceAssets)
		.values({
			workspaceId: input.workspaceId,
			kind: input.kind,
			key: input.key,
			url: input.url,
			sizeBytes: input.sizeBytes,
			contentType: input.contentType ?? null,
		})
		.onConflictDoUpdate({
			target: workspaceAssets.key,
			set: {
				sizeBytes: input.sizeBytes,
				url: input.url,
				contentType: input.contentType ?? null,
			},
		});
}

/**
 * Stop counting an asset, WITHOUT destroying it.
 *
 * 🔴 A soft delete. Media used to be erased from object storage the instant it
 * came off a product, so removing the wrong photograph was permanent, silent
 * and immediate. The customer's storage still falls the moment they do this,
 * because the gauge only counts rows with no `removedAt`, so they are not
 * charged for something they cannot see.
 *
 * ⚠️ The object stays for `PURGE_AFTER_DAYS` and a sweep collects it later.
 * That window is what makes a mis-click recoverable, and carrying the bytes for
 * a month is our cost rather than theirs.
 */
export async function forgetWorkspaceAsset(input: {
	workspaceId: string;
	key: string;
}): Promise<void> {
	await db
		.update(workspaceAssets)
		.set({ removedAt: new Date() })
		.where(
			and(
				eq(workspaceAssets.workspaceId, input.workspaceId),
				eq(workspaceAssets.key, input.key),
			),
		);
}

/** Put a removed asset back. The whole point of not deleting it. */
export async function restoreWorkspaceAsset(input: {
	workspaceId: string;
	key: string;
}): Promise<void> {
	await db
		.update(workspaceAssets)
		.set({ removedAt: null })
		.where(
			and(
				eq(workspaceAssets.workspaceId, input.workspaceId),
				eq(workspaceAssets.key, input.key),
			),
		);
}

/**
 * How long a removed file is kept before the sweep collects it.
 *
 * 🔴 24 HOURS, not weeks. Undo is offered in the screen where the removal
 * happened and disappears when somebody leaves it, so leaving a product page is
 * itself the confirmation. A window measured in weeks would only mean carrying
 * bytes we pay for against a recovery nobody can still ask for.
 *
 * ⚠️ The day is a buffer for the tab that was closed by accident, not a policy
 * anybody is told about. If undo ever becomes a durable thing somebody can find
 * later, this has to grow to match it.
 *
 * ⚠️ Independent of how often the SWEEP runs. The sweep only collects things
 * already past this cutoff, so running it every five minutes deletes nothing
 * early; it just keeps the bucket tidy.
 */
export const PURGE_AFTER_HOURS = 24;

/**
 * Everything removed long enough ago to be collected.
 *
 * Returns rather than deletes, because the object has to leave storage before
 * the row does: dropping the row first would lose the key and strand the file
 * in the bucket forever, which is the bug this whole area started with.
 */
export async function assetsReadyToPurge(
	now: Date = new Date(),
): Promise<Array<{ key: string; workspaceId: string }>> {
	const cutoff = new Date(now.getTime() - PURGE_AFTER_HOURS * 60 * 60 * 1000);
	return db
		.select({
			key: workspaceAssets.key,
			workspaceId: workspaceAssets.workspaceId,
		})
		.from(workspaceAssets)
		.where(
			and(
				isNotNull(workspaceAssets.removedAt),
				lt(workspaceAssets.removedAt, cutoff),
			),
		);
}

/** Drop the row once the object is actually gone. */
export async function dropWorkspaceAsset(input: {
	workspaceId: string;
	key: string;
}): Promise<void> {
	await db
		.delete(workspaceAssets)
		.where(
			and(
				eq(workspaceAssets.workspaceId, input.workspaceId),
				eq(workspaceAssets.key, input.key),
			),
		);
}

/**
 * Find the stored assets behind a set of urls, so the objects can be deleted.
 *
 * 🔴 Needed because product media is stored as bare urls while object storage
 * deletes by KEY. Without this mapping, removing a photograph took it off the
 * product and left the file in the bucket forever: invisible to the customer,
 * still paid for by us, and still counted against their storage.
 */
export async function assetsForUrls(input: {
	workspaceId: string;
	urls: readonly string[];
}): Promise<Array<{ key: string; url: string }>> {
	if (input.urls.length === 0) return [];
	return db
		.select({ key: workspaceAssets.key, url: workspaceAssets.url })
		.from(workspaceAssets)
		.where(
			and(
				eq(workspaceAssets.workspaceId, input.workspaceId),
				inArray(workspaceAssets.url, [...input.urls]),
			),
		);
}
