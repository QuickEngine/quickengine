export type CacheKey = string;

export type CacheSetOptions = {
	ttlSeconds?: number;
};

export type CacheProvider = {
	get<TValue>(key: CacheKey): Promise<TValue | null>;
	set<TValue>(
		key: CacheKey,
		value: TValue,
		options?: CacheSetOptions,
	): Promise<void>;
	delete(key: CacheKey): Promise<void>;
	/**
	 * Atomically increment a counter and return its new value, setting the key's expiry on
	 * first write so the window rolls.
	 *
	 * This exists because **rate limiting cannot be built on get/set**: read-then-write is a
	 * race, so two concurrent requests both read 4, both write 5, and a limit of 5 admits 6.
	 * Redis INCR is atomic; the memory provider is single-process, so its increment is too.
	 */
	increment(key: CacheKey, windowSeconds: number): Promise<number>;
};

type Entry = { value: unknown; expiresAt: number | null };

/**
 * In-process cache. Correct for tests and single-process local development, and explicitly
 * NOT correct across serverless invocations — every instance keeps its own map, so counters
 * never aggregate. Anything depending on shared state (rate limiting in production) must run
 * against Redis.
 */
export const createMemoryCacheProvider = (): CacheProvider => {
	const store = new Map<CacheKey, Entry>();

	// `set` previously accepted ttlSeconds and ignored it, so nothing ever expired and a
	// "one minute" window lasted for the life of the process.
	const read = (key: CacheKey): Entry | null => {
		const entry = store.get(key);
		if (!entry) return null;
		if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
			store.delete(key);
			return null;
		}
		return entry;
	};

	return {
		async get(key) {
			return (read(key)?.value ?? null) as never;
		},
		async set(key, value, options) {
			store.set(key, {
				value,
				expiresAt: options?.ttlSeconds
					? Date.now() + options.ttlSeconds * 1000
					: null,
			});
		},
		async delete(key) {
			store.delete(key);
		},
		async increment(key, windowSeconds) {
			const existing = read(key);
			const next = ((existing?.value as number) ?? 0) + 1;
			store.set(key, {
				value: next,
				// Keep the original expiry so the window rolls rather than extending on every
				// hit — otherwise a steady stream of requests would never reset.
				expiresAt: existing?.expiresAt ?? Date.now() + windowSeconds * 1000,
			});
			return next;
		},
	};
};

export { getCacheProvider, resetCacheProviderForTests } from "./provider";
export { createRedisCacheProvider } from "./redis";
export { createUpstashCacheProvider } from "./upstash";
