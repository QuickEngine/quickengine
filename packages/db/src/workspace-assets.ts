import { and, eq, inArray } from "drizzle-orm";
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
 * Stop counting an asset that has been removed.
 *
 * Storage is a gauge, so deleting the row is what gives the room back. A
 * customer who removes a photograph expects their usage to fall.
 */
export async function forgetWorkspaceAsset(input: {
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
