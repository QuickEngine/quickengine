import { getSearchProvider } from "@quickengine/search";

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
