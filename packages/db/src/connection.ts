import { serverEnv } from "@quickengine/env/server";
import postgres from "postgres";
import { createDatabaseClientOptions } from "./client-options";

// Cost + safety guardrail: never let a non-production deployment boot against production.
if (
	serverEnv.DATABASE_IS_PRODUCTION === "true" &&
	serverEnv.VERCEL_ENV &&
	serverEnv.VERCEL_ENV !== "production"
) {
	throw new Error(
		`Refusing to connect to the production database from a "${serverEnv.VERCEL_ENV}" deployment. Point this environment's DATABASE_URL at a preview/dev database — see docs/COST_GUARDRAILS.md.`,
	);
}

const globalForDb = globalThis as unknown as {
	pgClient: ReturnType<typeof postgres> | undefined;
};

export const databaseConnection =
	globalForDb.pgClient ??
	postgres(
		serverEnv.DATABASE_URL,
		createDatabaseClientOptions({
			connectTimeoutSeconds: serverEnv.DATABASE_CONNECT_TIMEOUT_SECONDS,
			environment: serverEnv.NODE_ENV,
			idleInTransactionTimeoutMs:
				serverEnv.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
			idleTimeoutSeconds: serverEnv.DATABASE_IDLE_TIMEOUT_SECONDS,
			lockTimeoutMs: serverEnv.DATABASE_LOCK_TIMEOUT_MS,
			maxLifetimeSeconds: serverEnv.DATABASE_MAX_LIFETIME_SECONDS,
			poolMax: serverEnv.DATABASE_POOL_MAX,
			statementTimeoutMs: serverEnv.DATABASE_STATEMENT_TIMEOUT_MS,
		}),
	);

if (serverEnv.NODE_ENV !== "production") {
	globalForDb.pgClient = databaseConnection;
}
