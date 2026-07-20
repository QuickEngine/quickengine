import { type CacheProvider, createMemoryCacheProvider } from "./index";
import { createRedisCacheProvider } from "./redis";
import { createUpstashCacheProvider } from "./upstash";

/**
 * The process-wide cache provider, selected once from the environment.
 *
 * Order matters and is deliberate:
 *
 * 1. **Upstash REST** when its credentials exist — production on Vercel, where a TCP socket
 *    per invocation exhausts connection limits.
 * 2. **TCP Redis** when `REDIS_URL` points somewhere real — local docker, so a security
 *    control can be exercised before it ships.
 * 3. **Memory** otherwise — tests and offline development.
 *
 * `REDIS_URL` has a default in the env schema (`redis://localhost:6381`), so its mere
 * presence proves nothing; `CACHE_DRIVER=memory` forces the in-process provider for tests
 * that must not touch a server.
 *
 * Mirrors `getSearchProvider` / `getRealtimeProvider` / `getJobQueue` — one pattern for every
 * external service.
 */
let provider: CacheProvider | undefined;

export function getCacheProvider(): CacheProvider {
	if (!provider) {
		const {
			CACHE_DRIVER,
			UPSTASH_REDIS_REST_URL,
			UPSTASH_REDIS_REST_TOKEN,
			REDIS_URL,
		} = process.env;

		if (CACHE_DRIVER === "memory") {
			provider = createMemoryCacheProvider();
		} else if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
			provider = createUpstashCacheProvider(
				UPSTASH_REDIS_REST_URL,
				UPSTASH_REDIS_REST_TOKEN,
			);
		} else if (REDIS_URL) {
			provider = createRedisCacheProvider(REDIS_URL);
		} else {
			provider = createMemoryCacheProvider();
		}
	}
	return provider;
}

// Test seam: drop the memoized selection so a test can re-evaluate it after changing env.
export function resetCacheProviderForTests(): void {
	provider = undefined;
}
