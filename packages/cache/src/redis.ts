import { createClient, type RedisClientType } from "redis";
import type { CacheProvider } from "./index";

/**
 * TCP Redis — the local/docker provider (`pnpm docker:up` runs one on :6381).
 *
 * This exists so a security control can be exercised before it reaches production. Rate
 * limiting built only against Upstash could not be verified locally, which is the same
 * "can't confirm it works until you're live" trap worth avoiding on anything protective.
 *
 * Connection is lazy and shared: a module-level client that connects on first use, since a
 * long-lived process is exactly the case TCP suits.
 */
export function createRedisCacheProvider(url: string): CacheProvider {
	let client: RedisClientType | undefined;

	const connection = async (): Promise<RedisClientType> => {
		if (!client) {
			client = createClient({ url }) as RedisClientType;
			// Without a listener, a dropped connection throws an unhandled 'error' event and
			// takes the process down — worse than the cache being unavailable.
			client.on("error", (error) => {
				console.error("[cache] redis connection error", error);
			});
			await client.connect();
		}
		return client;
	};

	return {
		async get(key) {
			const raw = await (await connection()).get(key);
			return (raw === null ? null : JSON.parse(raw)) as never;
		},
		async set(key, value, options) {
			const redis = await connection();
			const payload = JSON.stringify(value);
			if (options?.ttlSeconds) {
				await redis.set(key, payload, { EX: options.ttlSeconds });
			} else {
				await redis.set(key, payload);
			}
		},
		async delete(key) {
			await (await connection()).del(key);
		},
		async increment(key, windowSeconds) {
			const redis = await connection();
			const count = await redis.incr(key);
			// Expire only on the first hit so the window rolls from when it opened.
			if (count === 1) await redis.expire(key, windowSeconds);
			return count;
		},
	};
}
