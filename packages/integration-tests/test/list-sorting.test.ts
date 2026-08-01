import { testDbClient } from "@quickengine/db/testing";
import { listClientRecordsPage } from "@quickengine/mod-client-records";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "ls-owner";
const workspaceId = "00000000-0000-4000-8000-00000015a001";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'LS Owner', 'ls@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'LS Workspace', 'agency')
	`;
	// Inserted directly: creation goes through a durable command that needs an
	// execution context, and none of that is what this test is about.
	for (const name of ["Charlie", "alice", "Bravo"]) {
		await sql`
			insert into client_records (workspace_id, name, email)
			values (${workspaceId}, ${name}, ${`${name}@example.com`})
		`;
	}
});

/**
 * End-to-end proof that the sort conversion works through a real module list,
 * not just through the helper in isolation.
 *
 * `client-records` stands in for all seventeen: every list was converted the
 * same way, so a failure of the shape here would be a failure of the pattern.
 */
describe("list sorting", () => {
	it("sorts by a requested column instead of by id", async () => {
		const page = await listClientRecordsPage(workspaceId, {
			sort: "name",
			direction: "asc",
			limit: 10,
		});
		// Byte order, not locale order: Postgres's default collation sorts
		// uppercase before lowercase, so "Bravo" precedes "alice". Asserting
		// locale order here would be testing JavaScript, not the query.
		const names = page.items.map((row) => row.name);
		expect(names).toEqual([...names].sort());
	});

	it("reverses on direction", async () => {
		const asc = await listClientRecordsPage(workspaceId, {
			sort: "name",
			direction: "asc",
			limit: 10,
		});
		const desc = await listClientRecordsPage(workspaceId, {
			sort: "name",
			direction: "desc",
			limit: 10,
		});
		expect(desc.items.map((r) => r.name)).toEqual(
			asc.items.map((r) => r.name).reverse(),
		);
	});

	// A stale bookmark or an old client asking for a renamed column should still
	// get a usable page, not a 400.
	it("falls back to the default for an unknown sort", async () => {
		const page = await listClientRecordsPage(workspaceId, {
			sort: "no_such_column",
			limit: 10,
		});
		expect(page.items).toHaveLength(3);
	});

	// 🔴 The reason the cursor is compound. Paging one row at a time across a
	// sorted list must return each record exactly once.
	it("pages a sorted list without dropping or repeating a row", async () => {
		const seen: string[] = [];
		let cursor: string | undefined;
		for (let guard = 0; guard < 10; guard++) {
			const page = await listClientRecordsPage(workspaceId, {
				sort: "name",
				direction: "asc",
				limit: 1,
				cursor,
			});
			seen.push(...page.items.map((row) => row.id));
			if (!page.page.hasMore) break;
			cursor = page.page.nextCursor ?? undefined;
		}
		expect(seen).toHaveLength(3);
		expect(new Set(seen).size).toBe(3);
	});
});
