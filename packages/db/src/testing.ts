import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Integration-test database helpers. This module deliberately does NOT import
// `./client` or `@quickengine/env` at the top level: it is imported from the
// Vitest config, which runs BEFORE the test env (DATABASE_URL, BETTER_AUTH_SECRET)
// is populated. Pulling in `serverEnv` here would trip its zod validation at
// config load. Everything below opens its own short-lived postgres connections.

/** The dedicated integration-test database — never dev or prod data. */
export const TEST_DB_NAME = "quickengine_test";

const DEFAULT_URL =
	"postgresql://quickengine:quickengine_dev_password@localhost:5435/quickengine";

const withDatabase = (url: string, name: string): string => {
	const parsed = new URL(url);
	parsed.pathname = `/${name}`;
	return parsed.toString();
};

// Keep test output clean — postgres emits NOTICE chatter (e.g. "already exists,
// skipping") on idempotent migrator re-runs that we don't care to see.
const quiet = { onnotice: () => {} } as const;

/**
 * Resolve the test database URL from the ambient DATABASE_URL (or the docker
 * default), always swapping the database name to `quickengine_test`. This makes
 * it impossible to point the suite at the dev or prod database by accident.
 */
export const resolveTestDatabaseUrl = (): string =>
	withDatabase(process.env.DATABASE_URL ?? DEFAULT_URL, TEST_DB_NAME);

/**
 * Create `quickengine_test` if it doesn't exist, then apply the committed
 * Drizzle migrations to it. Applying real migrations (not a schema push) also
 * verifies the migrations apply cleanly — a blocking area in docs/TESTING.md.
 * Idempotent: safe to run before every suite.
 */
export const provisionTestDb = async (): Promise<void> => {
	const testUrl = resolveTestDatabaseUrl();

	// CREATE DATABASE can't run against the target itself — connect to the
	// always-present `postgres` maintenance database on the same server.
	const admin = postgres(withDatabase(testUrl, "postgres"), {
		max: 1,
		...quiet,
	});
	try {
		const existing = await admin`
			SELECT 1 FROM pg_database WHERE datname = ${TEST_DB_NAME}
		`;
		if (existing.length === 0) {
			await admin.unsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
		}
	} finally {
		await admin.end();
	}

	const migrationClient = postgres(testUrl, { max: 1, ...quiet });
	try {
		await migrate(drizzle(migrationClient), {
			migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
		});
	} finally {
		await migrationClient.end();
	}
};

// A cached connection for truncation + fixtures, so we don't reconnect per test.
let sharedClient: ReturnType<typeof postgres> | undefined;

/** A raw postgres client bound to the test database (for truncation/fixtures). */
export const testDbClient = (): ReturnType<typeof postgres> => {
	sharedClient ??= postgres(resolveTestDatabaseUrl(), { max: 1, ...quiet });
	return sharedClient;
};

// Truncated between every test for isolation. Ordered child-first, but CASCADE
// makes order moot; RESTART IDENTITY resets any serial counters.
const TABLES = [
	"quickengine_two_factors",
	"quickengine_passkeys",
	"quickengine_sessions",
	"quickengine_accounts",
	"quickengine_verifications",
	"quickengine_subscriptions",
	"quickengine_organizations",
	"quickengine_users",
];

/** Wipe every auth-related table so each test starts from a clean slate. */
export const truncateAll = async (): Promise<void> => {
	const list = TABLES.map((table) => `"${table}"`).join(", ");
	await testDbClient().unsafe(
		`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
	);
};

/** Close the shared connection so the test process can exit cleanly. */
export const closeTestDb = async (): Promise<void> => {
	await sharedClient?.end();
	sharedClient = undefined;
};
