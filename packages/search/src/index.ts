export type SearchIndexName =
	| "apps"
	| "users"
	| "quickdash"
	| "quickflow"
	| "docs";

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
};

export const createEmptySearchProvider = (): SearchProvider => ({
	async index() {},
	async remove() {},
	async search() {
		return [];
	},
});
