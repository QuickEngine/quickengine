import { createAlgoliaClient, createAlgoliaSearchProvider } from "./algolia";
import { createEmptySearchProvider, type SearchProvider } from "./index";

// The process-wide search provider. Algolia when its credentials are configured
// (staging/prod), otherwise the empty no-op provider so local dev and tests run offline.
// This is the single place provider selection lives — callers only see `SearchProvider`.
let provider: SearchProvider | undefined;

export function getSearchProvider(): SearchProvider {
	if (!provider) {
		const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY } = process.env;
		provider =
			ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY
				? createAlgoliaSearchProvider(
						createAlgoliaClient(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY),
					)
				: createEmptySearchProvider();
	}
	return provider;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing env.
export function resetSearchProviderForTests(): void {
	provider = undefined;
}
