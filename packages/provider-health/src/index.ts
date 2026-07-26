/**
 * Whether a provider fell back to its offline implementation, and whether anyone
 * should care.
 *
 * `realtime`, `jobs`, and `search` all select between a real provider and an offline
 * stand-in based on whether their credentials are present. That fallback is
 * deliberate and correct for local development and tests — it is what lets the whole
 * stack run without network access.
 *
 * **In a production deployment the same fallback is a silent outage.** An in-memory
 * job queue on a serverless runtime accepts work and loses it at the next cold start,
 * which means outbox dispatch and webhook delivery stop without a single error
 * anywhere. The product looks healthy and is not.
 *
 * This module is the difference between those two cases. It stays quiet where the
 * fallback is intended, and makes it impossible to miss where it is not.
 */

/** What was lost, in terms of what it means rather than which class was constructed. */
export type ProviderDegradation = {
	/** The capability, not the vendor: `realtime`, `jobs`, `search`. */
	provider: string;
	/** The stand-in that was selected, in plain language. */
	implementation: string;
	/** What stops working. Written to be understood at 3am. */
	consequence: string;
	/**
	 * Names of the environment variables that would have selected the real provider.
	 * **Names only — never values.** This string reaches logs.
	 */
	missing: readonly string[];
	/**
	 * `data-loss` means work is accepted and then silently discarded. That is not a
	 * degraded feature, it is a correctness failure, and readiness must fail on it.
	 * `feature-loss` means a capability is unavailable but nothing is lost.
	 */
	severity: "data-loss" | "feature-loss";
};

const degraded = new Map<string, ProviderDegradation>();

/**
 * A real deployment, as opposed to local development, CI, or a preview build.
 *
 * `VERCEL_ENV` is set by the platform and is the only signal that distinguishes a
 * production deployment from a preview one — `NODE_ENV` is `production` for both, so
 * using it here would fire on every preview build and train everyone to ignore this.
 */
export function isProductionDeployment(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env.VERCEL_ENV === "production";
}

/**
 * Record which implementation a provider selected.
 *
 * Call this from the one place selection happens, on **both** paths. Reporting only
 * the degraded path would mean a provider that stopped being reported could not be
 * distinguished from one that was never wired up.
 */
export function reportProviderSelection(
	selection:
		| { provider: string; degraded: false }
		| ({ degraded: true } & ProviderDegradation),
	options: {
		env?: NodeJS.ProcessEnv;
		/** Injected in tests; production writes to stderr. */
		log?: (message: string) => void;
	} = {},
): void {
	if (!selection.degraded) {
		degraded.delete(selection.provider);
		return;
	}

	const { degraded: _, ...detail } = selection;
	degraded.set(detail.provider, detail);

	// Silence is correct off-production: the fallback is the intended behaviour there,
	// and a warning on every local `pnpm dev` is a warning nobody reads in production.
	if (!isProductionDeployment(options.env ?? process.env)) return;

	const log = options.log ?? ((message: string) => console.error(message));
	log(
		[
			`[provider-health] ${detail.provider.toUpperCase()} IS DEGRADED IN PRODUCTION`,
			`  using: ${detail.implementation}`,
			`  consequence: ${detail.consequence}`,
			`  unset: ${detail.missing.join(", ")}`,
			detail.severity === "data-loss"
				? "  severity: DATA LOSS — readiness will report not-ready"
				: "  severity: feature unavailable",
		].join("\n"),
	);
}

/** Every provider currently running on its offline stand-in. */
export function getDegradedProviders(): ProviderDegradation[] {
	return [...degraded.values()];
}

/**
 * Whether the process is losing work.
 *
 * Readiness uses this rather than the raw list: a missing search index is a bad day,
 * an evaporating job queue is a bug report from a customer whose webhook never
 * arrived, and only the second should take an instance out of rotation.
 */
export function hasDataLossDegradation(): boolean {
	return [...degraded.values()].some((entry) => entry.severity === "data-loss");
}

/** Test seam: forget every recorded selection. */
export function resetProviderHealthForTests(): void {
	degraded.clear();
}
