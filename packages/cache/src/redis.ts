import { createClient, type RedisClientType } from "redis";
import type { CacheProvider } from "./index";

const INCREMENT_WITH_EXPIRY = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

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
		kind: "redis",
		shared: true,
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
		async ping() {
			await (await connection()).ping();
		},
		async setIfAbsent(key, value, options) {
			const result = await (await connection()).set(
				key,
				JSON.stringify(value),
				{
					EX: options.ttlSeconds,
					NX: true,
				},
			);
			return result === "OK";
		},
		async increment(key, windowSeconds) {
			const redis = await connection();
			const count = await redis.eval(INCREMENT_WITH_EXPIRY, {
				arguments: [String(windowSeconds)],
				keys: [key],
			});
			return Number(count);
		},
	};
}
