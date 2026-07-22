export type DatabaseRuntimeOptionsInput = {
	connectTimeoutSeconds?: number;
	environment: "development" | "production" | "test";
	idleInTransactionTimeoutMs?: number;
	idleTimeoutSeconds?: number;
	lockTimeoutMs?: number;
	maxLifetimeSeconds?: number;
	poolMax?: number;
	statementTimeoutMs?: number;
};

/**
 * Conservative postgres.js bounds shared by every application runtime.
 *
 * Production defaults to two connections per serverless instance; Neon/PgBouncer remains the
 * cross-instance pool. Query/lock/idle limits prevent a single abandoned request from retaining
 * scarce connections indefinitely. Migrations use Drizzle Kit's separate direct connection.
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
	} as const;
}
