export type DatabaseRuntimeOptionsInput = {
	connectTimeoutSeconds?: number;
	/**
	 * The URL the client will connect with, used ONLY to detect a
	 * transaction-mode pooler. Never logged, never stored.
	 */
	connectionUrl?: string;
	environment: "development" | "production" | "test";
	idleInTransactionTimeoutMs?: number;
	idleTimeoutSeconds?: number;
	lockTimeoutMs?: number;
	maxLifetimeSeconds?: number;
	poolMax?: number;
	/**
	 * Force named prepared statements on or off.
	 *
	 * ⚠️ Leave unset unless detection is wrong. Set explicitly only to recover
	 * from a pooler this does not recognise, rather than as a tuning knob.
	 */
	preparedStatements?: boolean;
	statementTimeoutMs?: number;
};

/**
 * Is this URL a TRANSACTION-mode pooler?
 *
 * 🔴 Named prepared statements do not survive one. In transaction pooling each
 * statement can land on a different backend connection, so a statement prepared
 * on one is missing on the next — which surfaces as intermittent
 * `prepared statement "s1" does not exist` under load rather than a clean
 * failure at boot, and only once traffic is concurrent enough to reuse
 * connections.
 *
 * ⚠️ Detected from the port and host because that is all the URL tells us.
 * Supabase's transaction pooler is `:6543` on a `pooler.supabase.com` host;
 * their session pooler is `:5432` on the same host and DOES keep prepared
 * statements, so the port is what distinguishes them, not the hostname.
 */
function isTransactionPooler(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		if (parsed.port === "6543") return true;
		/**
		 * 🔴 Suffix match on a DOT boundary, never `includes`.
		 *
		 * `hostname.includes("pooler.supabase.com")` also matches
		 * `pooler.supabase.com.example.net`, which is a host somebody else
		 * controls. CodeQL flagged it as `js/incomplete-url-substring-sanitization`
		 * and was right: the consequence here is only a wrong pooling decision,
		 * but the pattern is the one that becomes a real hole the moment it is
		 * copied somewhere that grants trust.
		 */
		const host = parsed.hostname.toLowerCase();
		const isKnownPoolerHost =
			host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com");
		return isKnownPoolerHost && parsed.searchParams.get("pgbouncer") === "true";
	} catch {
		// An unparseable URL is the connection's problem, not this function's.
		return false;
	}
}

/**
 * Conservative postgres.js bounds shared by every application runtime.
 *
 * Production defaults to two connections per serverless instance; an external pooler
 * (PgBouncer, Supavisor, or a provider's own) remains the cross-instance pool. Query/lock/idle
 * limits prevent a single abandoned request from retaining scarce connections indefinitely.
 * Migrations use Drizzle Kit's separate direct connection, which must NOT be a transaction pooler.
 */
export function createDatabaseClientOptions(
	input: DatabaseRuntimeOptionsInput,
) {
	return {
		connect_timeout: input.connectTimeoutSeconds ?? 10,
		connection: {
			application_name: "quickengine",
			idle_in_transaction_session_timeout:
				input.idleInTransactionTimeoutMs ?? 15_000,
			lock_timeout: input.lockTimeoutMs ?? 5_000,
			statement_timeout: input.statementTimeoutMs ?? 30_000,
		},
		idle_timeout: input.idleTimeoutSeconds ?? 20,
		max: input.poolMax ?? (input.environment === "production" ? 2 : 10),
		max_lifetime: input.maxLifetimeSeconds ?? 30 * 60,
		/**
		 * 🔴 Off behind a transaction pooler. See `isTransactionPooler` above.
		 *
		 * Kept ON everywhere else: prepared statements are what make a repeated
		 * query cheap, and a direct connection or session pooler holds them
		 * correctly.
		 */
		prepare:
			input.preparedStatements ?? !isTransactionPooler(input.connectionUrl),
	} as const;
}
