import { algoliasearch } from "algoliasearch";
import type { SearchIndexName, SearchProvider, SearchRecord } from "./index";

// The minimal Algolia client surface the provider uses — so it can be unit-tested against
// a fake without the full SDK generics. The real client (algoliasearch v5) is compatible.
export type AlgoliaClient = {
	saveObjects(options: {
		indexName: string;
		objects: Array<Record<string, unknown>>;
	}): Promise<unknown>;
	deleteObjects(options: {
		indexName: string;
		objectIDs: string[];
	}): Promise<unknown>;
	searchSingleIndex<T>(options: {
		indexName: string;
		searchParams: Record<string, unknown>;
	}): Promise<{ hits: T[] }>;
	setSettings(options: {
		indexName: string;
		indexSettings: Record<string, unknown>;
	}): Promise<unknown>;
};

// Flatten a SearchRecord into an Algolia object: searchable fields plus any metadata
// (e.g. workspaceId) promoted to top-level attributes so they're filterable.
function toObject(record: SearchRecord): Record<string, unknown> {
	const { metadata, ...rest } = record;
	return { ...rest, ...(metadata ?? {}) };
}

// Build Algolia's filter string from the provider-neutral filter map:
// { workspaceId: "ws-1" } → `workspaceId:"ws-1"`. This is the tenant-isolation gate.
function toFilters(
	filters?: Record<string, string | number | boolean>,
): string | undefined {
	if (!filters) return undefined;
	const parts = Object.entries(filters).map(([key, value]) =>
		typeof value === "string" ? `${key}:"${value}"` : `${key}:${value}`,
	);
	return parts.length > 0 ? parts.join(" AND ") : undefined;
}

export function createAlgoliaSearchProvider(
	client: AlgoliaClient,
): SearchProvider {
	return {
		async index(index, records) {
			if (records.length === 0) return;
			await client.saveObjects({
				indexName: index,
				objects: records.map(toObject),
			});
		},
		async remove(index, objectIDs) {
			if (objectIDs.length === 0) return;
			await client.deleteObjects({ indexName: index, objectIDs });
		},
		async search(query) {
			const { hits } = await client.searchSingleIndex<SearchRecord>({
				indexName: query.index,
				searchParams: {
					query: query.query,
					hitsPerPage: query.limit ?? 10,
					filters: toFilters(query.filters),
				},
			});
			return hits.map((hit) => ({ ...hit }));
		},
		async configure(index, options) {
			await client.setSettings({
				indexName: index,
				indexSettings: {
					// filterOnly = filterable but not searchable/facet-counted — right for ids.
					attributesForFaceting: options.filterableAttributes.map(
						(attr) => `filterOnly(${attr})`,
					),
				},
			});
		},
	};
}

// Build a real Algolia client from credentials (admin key = read + write).
export function createAlgoliaClient(
	appId: string,
	apiKey: string,
): AlgoliaClient {
	return algoliasearch(appId, apiKey) as unknown as AlgoliaClient;
}

export type { SearchIndexName };
