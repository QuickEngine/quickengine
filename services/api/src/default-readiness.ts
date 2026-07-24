import { getCacheProvider } from "@quickengine/cache";
import type { ApiConfig } from "./config";
import type { ReadinessCheck } from "./readiness";

export function createDefaultReadinessChecks(
	config: ApiConfig,
): readonly ReadinessCheck[] {
	const cache = getCacheProvider();
	return [
		{
			critical: true,
			name: "database",
			async run(signal) {
				signal.throwIfAborted();
				const { checkHealth } = await import("@quickengine/db/health");
				const report = await checkHealth();
				signal.throwIfAborted();
				if (report.checks.database !== "ok")
					throw new Error("database probe failed");
			},
		},
		{
			critical: config.environment === "production",
			name: "request-control-store",
			async run(signal) {
				signal.throwIfAborted();
				if (config.environment === "production" && !cache.shared) {
					throw new Error("production requires a shared cache");
				}
				await cache.ping();
				signal.throwIfAborted();
			},
		},
	];
}
