export type SearchIndexName = "apps" | "users" | "quickdash" | "docs";

export type SearchRecord = {
	objectID: string;
	title: string;
	description?: string;
	url?: string;
	metadata?: Record<string, unknown>;
};

export type SearchQuery = {
	index: SearchIndexName;
	query: string;
	limit?: number;
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
