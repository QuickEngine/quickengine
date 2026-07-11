import { serverEnv } from "@quickengine/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Cost + safety guardrail: never let a non-production deployment (a Vercel
// preview or development build) boot against the production database. Set
// DATABASE_IS_PRODUCTION="true" alongside the prod DATABASE_URL, scoped to the
// Production environment only. See docs/COST_GUARDRAILS.md.
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

const client = globalForDb.pgClient ?? postgres(serverEnv.DATABASE_URL);

if (serverEnv.NODE_ENV !== "production") {
	globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
