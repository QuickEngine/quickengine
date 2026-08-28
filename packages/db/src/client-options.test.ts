import { describe, expect, it } from "vitest";
import { createDatabaseClientOptions } from "./client-options";

describe("database runtime bounds", () => {
	it("uses a serverless-safe production pool and bounded waits", () => {
		expect(createDatabaseClientOptions({ environment: "production" })).toEqual({
			connect_timeout: 10,
			connection: {
				application_name: "quickengine",
				idle_in_transaction_session_timeout: 15_000,
				lock_timeout: 5_000,
				statement_timeout: 30_000,
			},
			idle_timeout: 20,
			max: 2,
			max_lifetime: 1800,
			// No connection url given, so nothing suggests a pooler: prepared
			// statements stay on. The pooler cases are covered further down.
			prepare: true,
		});
	});

	it("accepts explicit validated operational overrides", () => {
		const options = createDatabaseClientOptions({
			connectTimeoutSeconds: 4,
			environment: "development",
			idleInTransactionTimeoutMs: 9000,
			idleTimeoutSeconds: 8,
			lockTimeoutMs: 1500,
			maxLifetimeSeconds: 600,
			poolMax: 4,
			statementTimeoutMs: 12_000,
		});

		expect(options).toMatchObject({
			connect_timeout: 4,
			idle_timeout: 8,
			max: 4,
			max_lifetime: 600,
			connection: {
				idle_in_transaction_session_timeout: 9000,
				lock_timeout: 1500,
				statement_timeout: 12_000,
			},
		});
	});
});

/**
 * 🔴 Named prepared statements do not survive a TRANSACTION-mode pooler.
 *
 * Each statement can land on a different backend connection, so one prepared on
 * the first is missing on the next. It surfaces as intermittent
 * `prepared statement "s1" does not exist` once traffic is concurrent enough to
 * reuse connections — not as a clean failure at boot, which is what makes it
 * worth a test rather than a comment.
 */
describe("prepared statements behind a pooler", () => {
	const optionsFor = (connectionUrl: string) =>
		createDatabaseClientOptions({ environment: "production", connectionUrl });

	it("disables them on a transaction pooler", () => {
		expect(
			optionsFor(
				"postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
			).prepare,
		).toBe(false);
	});

	/**
	 * ⚠️ Same host, different port. The session pooler holds a backend connection
	 * for the whole session, so prepared statements are safe and worth keeping.
	 */
	it("keeps them on a session pooler on the same host", () => {
		expect(
			optionsFor(
				"postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
			).prepare,
		).toBe(true);
	});

	it("keeps them on a direct connection", () => {
		expect(
			optionsFor("postgresql://u:p@db.example.supabase.co:5432/postgres")
				.prepare,
		).toBe(true);
	});

	it("recognises an explicit pgbouncer flag", () => {
		expect(
			optionsFor(
				"postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true",
			).prepare,
		).toBe(false);
	});

	/**
	 * 🔴 A host somebody else controls must not be read as ours.
	 *
	 * `pooler.supabase.com.example.net` contains our hostname as a substring but
	 * is a completely different domain. CodeQL caught the `includes` version of
	 * this as `js/incomplete-url-substring-sanitization` on 2026-08-28.
	 */
	it("does not treat a lookalike host as the pooler", () => {
		expect(
			optionsFor(
				"postgresql://u:p@pooler.supabase.com.example.net:5432/postgres?pgbouncer=true",
			).prepare,
		).toBe(true);
		expect(
			optionsFor(
				"postgresql://u:p@evil-pooler.supabase.com.attacker.test:5432/postgres?pgbouncer=true",
			).prepare,
		).toBe(true);
	});

	/** ⚠️ The real host is a SUBDOMAIN of it, so the dot boundary must still pass. */
	it("still recognises the genuine regional pooler host", () => {
		expect(
			optionsFor(
				"postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true",
			).prepare,
		).toBe(false);
	});

	/** An unparseable URL must not decide this; the connection will fail anyway. */
	it("does not guess from a malformed url", () => {
		expect(optionsFor("not-a-url").prepare).toBe(true);
	});

	it("lets an explicit setting override detection", () => {
		expect(
			createDatabaseClientOptions({
				environment: "production",
				connectionUrl:
					"postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
				preparedStatements: true,
			}).prepare,
		).toBe(true);
	});
});
