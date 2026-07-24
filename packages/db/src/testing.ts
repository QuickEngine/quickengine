import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Integration-test database helpers. This module deliberately does NOT import
// `./client` or `@quickengine/env` at the top level: it is imported from the
// Vitest config, which runs BEFORE the test env (DATABASE_URL, BETTER_AUTH_SECRET)
// is populated. Pulling in `serverEnv` here would trip its zod validation at
// config load. Everything below opens its own short-lived postgres connections.

/**
 * The dedicated integration-test database — never dev or prod data. Each test
 * package sets its own name via TEST_DB_NAME so suites that run in parallel
 * (turbo) don't share a database and truncate each other mid-test.
 */
export const testDbName = (): string =>
	process.env.TEST_DB_NAME ?? "quickengine_test";

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

const LOCAL_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"host.docker.internal",
]);

/**
 * Refuse a non-local database host. Swapping the database NAME is not protection on
 * its own: the host is inherited from DATABASE_URL, so with `.env.local` pointed at
 * Neon this resolver happily produces a test-named database ON PRODUCTION — and every
 * suite calls `truncateAll()` between tests. Sixteen vitest/playwright configs go
 * through here, so the guard belongs at the source rather than in any one of them.
 *
 * `ALLOW_REMOTE_TEST_DB=1` opts out deliberately (e.g. a disposable remote branch in CI).
 */
const assertLocalHost = (url: string): string => {
	if (process.env.ALLOW_REMOTE_TEST_DB === "1") return url;
	const { hostname } = new URL(url);
	if (!LOCAL_HOSTS.has(hostname)) {
		throw new Error(
			`Refusing to run tests against non-local database host "${hostname}". ` +
				"These suites TRUNCATE every table. Point DATABASE_URL at docker " +
				"(pnpm docker:up) or set ALLOW_REMOTE_TEST_DB=1 to override deliberately.",
		);
	}
	return url;
};

/**
 * Resolve the test database URL from the ambient DATABASE_URL (or the docker default),
 * always swapping the database name to the per-suite test name AND requiring the host
 * to be local. Both halves matter — see `assertLocalHost`.
 */
export const resolveTestDatabaseUrl = (): string =>
	assertLocalHost(
		withDatabase(process.env.DATABASE_URL ?? DEFAULT_URL, testDbName()),
	);

/**
 * Create `quickengine_test` if it doesn't exist, then apply the committed
 * Drizzle migrations to it. Applying real migrations (not a schema push) also
 * verifies the migrations apply cleanly — a blocking area in internal/TESTING.md.
 * Idempotent: safe to run before every suite.
 */
export const provisionTestDb = async (): Promise<void> => {
	const testUrl = resolveTestDatabaseUrl();
	const name = testDbName();

	// CREATE DATABASE can't run against the target itself — connect to the
	// always-present `postgres` maintenance database on the same server.
	const admin = postgres(withDatabase(testUrl, "postgres"), {
		max: 1,
		...quiet,
	});
	try {
		const existing = await admin`
			SELECT 1 FROM pg_database WHERE datname = ${name}
		`;
		if (existing.length === 0) {
			await admin.unsafe(`CREATE DATABASE "${name}"`);
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

/**
 * Wipe every public table so each test starts from a clean slate. Discovers the
 * tables at runtime (excluding Drizzle's migration bookkeeping) rather than
 * hardcoding a list, so a newly added table can never be silently left out of the
 * reset — which would let usage/state leak between tests. CASCADE handles FK order.
 */
export const truncateAll = async (): Promise<void> => {
	const client = testDbClient();
	const rows = await client<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public' AND tablename NOT LIKE ${"\\_\\_drizzle%"}
	`;
	if (rows.length === 0) {
		return;
	}
	const list = rows.map((row) => `"${row.tablename}"`).join(", ");
	await client.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

/** Close the shared connection so the test process can exit cleanly. */
export const closeTestDb = async (): Promise<void> => {
	await sharedClient?.end();
	sharedClient = undefined;
};
