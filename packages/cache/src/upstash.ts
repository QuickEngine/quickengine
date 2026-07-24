import { Redis } from "@upstash/redis";
import type { CacheProvider } from "./index";

const INCREMENT_WITH_EXPIRY = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

/**
 * Upstash over HTTP — the production provider.
 *
 * REST rather than a TCP client because production runs on Vercel: a serverless invocation
 * that opens a socket per request exhausts connection limits under load, which is the exact
 * failure mode you hit at the moment traffic justifies rate limiting in the first place.
 */
export function createUpstashCacheProvider(
	url: string,
	token: string,
): CacheProvider {
	const redis = new Redis({ url, token });

	return {
		kind: "upstash",
		shared: true,
		async get(key) {
			return (await redis.get(key)) as never;
		},
		async set(key, value, options) {
			if (options?.ttlSeconds) {
				await redis.set(key, value, { ex: options.ttlSeconds });
			} else {
				await redis.set(key, value);
			}
		},
		async delete(key) {
			await redis.del(key);
		},
		async ping() {
			await redis.ping();
		},
		async setIfAbsent(key, value, options) {
			const result = await redis.set(key, value, {
				ex: options.ttlSeconds,
				nx: true,
			});
			return result === "OK";
		},
		async increment(key, windowSeconds) {
			return Number(
				await redis.eval(INCREMENT_WITH_EXPIRY, [key], [String(windowSeconds)]),
			);
		},
	};
}
