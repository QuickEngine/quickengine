import { serverEnv } from "@quickengine/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	pgClient: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.pgClient ?? postgres(serverEnv.DATABASE_URL);

if (serverEnv.NODE_ENV !== "production") {
	globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
