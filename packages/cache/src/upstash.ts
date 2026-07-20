import { Redis } from "@upstash/redis";
import type { CacheProvider } from "./index";

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
		async increment(key, windowSeconds) {
			const count = await redis.incr(key);
			// Set the expiry only on the first hit, so the window rolls from when it opened
			// rather than being extended by every subsequent request.
			if (count === 1) await redis.expire(key, windowSeconds);
			return count;
		},
	};
}
