import { reportProviderSelection } from "@quickengine/provider-health";
import { createAlgoliaClient, createAlgoliaSearchProvider } from "./algolia";
import { createEmptySearchProvider, type SearchProvider } from "./index";

// The process-wide search provider. Algolia when its credentials are configured
// (staging/prod), otherwise the empty no-op provider so local dev and tests run offline.
// This is the single place provider selection lives — callers only see `SearchProvider`.
let provider: SearchProvider | undefined;

export function getSearchProvider(): SearchProvider {
	if (!provider) {
		const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY } = process.env;
		if (ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY) {
			provider = createAlgoliaSearchProvider(
				createAlgoliaClient(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY),
			);
			reportProviderSelection({ provider: "search", degraded: false });
		} else {
			provider = createEmptySearchProvider();
			// Returns no results rather than failing, which reads to a user as "you
			// have nothing" instead of "search is broken" — the more misleading of
			// the two failure modes, and the reason this is worth announcing.
			reportProviderSelection({
				degraded: true,
				provider: "search",
				implementation: "empty provider",
				consequence:
					"every query returns no results, which is indistinguishable from an empty workspace",
				missing: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_KEY"],
				severity: "feature-loss",
			});
		}
	}
	return provider;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing env.
export function resetSearchProviderForTests(): void {
	provider = undefined;
}
