import { drizzle } from "drizzle-orm/postgres-js";
import { databaseConnection } from "./connection";
import * as schema from "./schema";

export const db = drizzle(databaseConnection, { schema });
export type Database = typeof db;
