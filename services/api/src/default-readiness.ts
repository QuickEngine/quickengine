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
		{
			critical: config.environment === "production",
			name: "providers",
			/**
			 * Catch a provider that silently fell back to its offline stand-in.
			 *
			 * This **forces selection** rather than reading whatever has happened to
			 * be initialised. Provider selection is lazy, so a check that only read
			 * the registry would pass on a freshly booted instance — reporting ready
			 * right up until the first job quietly evaporated.
			 *
			 * Only data-loss degradation fails readiness. A missing search index is a
			 * bad day; a job queue that accepts work and forgets it is a customer
			 * whose webhook never arrived, and that instance should leave rotation.
			 */
			async run(signal) {
				signal.throwIfAborted();
				const [
					{ getJobQueue },
					{ hasDataLossDegradation, getDegradedProviders },
				] = await Promise.all([
					import("@quickengine/jobs"),
					import("@quickengine/provider-health"),
				]);
				getJobQueue();
				signal.throwIfAborted();
				if (hasDataLossDegradation()) {
					const names = getDegradedProviders()
						.filter((entry) => entry.severity === "data-loss")
						.map((entry) => entry.provider)
						.join(", ");
					throw new Error(`provider degraded with data loss: ${names}`);
				}
			},
		},
	];
}
