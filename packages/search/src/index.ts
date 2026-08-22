export type SearchIndexName = "apps" | "users" | "quickdash" | "docs";

export type SearchRecord = {
	objectID: string;
	title: string;
	description?: string;
	url?: string;
	metadata?: Record<string, unknown>;
};

/**
 * One search, against one workspace.
 *
 * 🔴 `workspaceId` is REQUIRED, and that is the whole point of this type.
 *
 * Every workspace's records live in ONE shared Algolia index — one index is
 * cheaper, and Algolia charges per index — so the only thing separating one
 * business's orders from another's is a filter on the query. An optional filter
 * is a filter somebody eventually omits, and omitting it here does not fail:
 * it silently returns every workspace's records to whoever asked.
 *
 * Making it part of the type means a query without a workspace does not
 * compile. That is a stronger guarantee than a review, a guard or a test,
 * because there is no version of the mistake left to make.
 *
 * ⚠️ Extra `filters` are ANDed with the workspace, never instead of it.
 */
export type SearchQuery = {
	index: SearchIndexName;
	query: string;
	limit?: number;
	/** Whose records may be returned. Not optional. See above. */
	workspaceId: string;
	filters?: Record<string, string | number | boolean>;
};

export type SearchResult = SearchRecord & {
	score?: number;
};

export type SearchProvider = {
	index(index: SearchIndexName, records: SearchRecord[]): Promise<void>;
	remove(index: SearchIndexName, objectIDs: string[]): Promise<void>;
	search(query: SearchQuery): Promise<SearchResult[]>;
	// Declare which attributes an index can be FILTERED on (e.g. workspaceId for tenant
	// isolation). Idempotent; a no-op on providers that don't need index configuration.
	configure(
		index: SearchIndexName,
		options: { filterableAttributes: string[] },
	): Promise<void>;
};

export const createEmptySearchProvider = (): SearchProvider => ({
	async index() {},
	async remove() {},
	async search() {
		return [];
	},
	async configure() {},
});

// Algolia-backed provider + the env-based selector. Kept below the shared types so the
// runtime re-export cycle resolves cleanly (same pattern as jobs/realtime).
export {
	type AlgoliaClient,
	createAlgoliaClient,
	createAlgoliaSearchProvider,
} from "./algolia";
export { getSearchProvider, resetSearchProviderForTests } from "./provider";
