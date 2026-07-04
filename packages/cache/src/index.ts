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
};

export const createMemoryCacheProvider = (): CacheProvider => {
	const store = new Map<CacheKey, unknown>();

	return {
		async get(key) {
			return (store.get(key) ?? null) as never;
		},
		async set(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
	};
};
