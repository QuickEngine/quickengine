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
