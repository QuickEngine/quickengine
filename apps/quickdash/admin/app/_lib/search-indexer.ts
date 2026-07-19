import type { DomainEvent } from "@quickengine/events";
import { getClientRecord } from "@quickengine/mod-client-records";
import { getSearchProvider } from "@quickengine/search";

// Turn a committed domain event into a search-index update. Best-effort: search is not the
// source of truth, so failures are swallowed. Reads the record's current content (the event
// envelope is tiny by design). Extend the branches as more modules emit record events.
export async function indexEventForSearch(event: DomainEvent): Promise<void> {
	try {
		const provider = getSearchProvider();

		if (event.name.startsWith("client_records.record.")) {
			if (event.name.endsWith(".deleted")) {
				await provider.remove("quickdash", [event.recordId]);
				return;
			}
			const record = await getClientRecord(event.workspaceId, event.recordId);
			if (!record) return;
			const description =
				[record.email, record.company].filter(Boolean).join(" · ") || undefined;
			await provider.index("quickdash", [
				{
					objectID: record.id,
					title: record.name,
					description,
					url: `/${event.workspaceId}/client-records`,
					metadata: {
						workspaceId: event.workspaceId,
						module: "client-records",
					},
				},
			]);
		}
	} catch (error) {
		console.error("[search-indexer] failed to index event:", error);
	}
}

// Declare the tenant-isolation filter attribute on the workspace index. Idempotent; called
// once at startup so `workspaceId` filtering works (a no-op when search isn't configured).
export async function configureSearchIndex(): Promise<void> {
	try {
		await getSearchProvider().configure("quickdash", {
			filterableAttributes: ["workspaceId"],
		});
	} catch (error) {
		console.error("[search-indexer] failed to configure index:", error);
	}
}
