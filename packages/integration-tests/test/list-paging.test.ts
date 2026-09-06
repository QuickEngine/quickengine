import { testDbClient } from "@quickengine/db/testing";
import { listBookingsPage } from "@quickengine/mod-bookings";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "lp-owner";
const workspaceId = "00000000-0000-4000-8000-0000001a9001";
const NAMES = ["alpha", "bravo", "charlie", "delta", "echo"];

beforeEach(async () => {
	const sql = testDbClient();
	await sql`delete from bookings where workspace_id = ${workspaceId}`;
	await sql`delete from quickengine_workspaces where id = ${workspaceId}`;
	await sql`delete from quickengine_users where id = ${ownerId}`;
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'LP Owner', 'lp@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'LP Workspace', 'agency')
	`;
	// Inserted directly: creation goes through a durable command that needs an
	// execution context, and none of that is what this test is about.
	for (const [index, name] of NAMES.entries()) {
		const startsAt = new Date(Date.UTC(2026, 0, 2 + index, 10, 0, 0));
		const endsAt = new Date(Date.UTC(2026, 0, 2 + index, 11, 0, 0));
		await sql`
			insert into bookings
				(workspace_id, client_name, title, starts_at, ends_at, time_zone)
			values
				(${workspaceId}, 'LP Client', ${name}, ${startsAt}, ${endsAt}, 'UTC')
		`;
	}
});

/**
 * Paging past the FIRST page, through a real module list.
 *
 * 🔴 The bug this exists for: eight lists returned `nextCursor: items.at(-1).id`,
 * a bare uuid, while `decodeCursor` expects an encoded `(sortValue, id)` pair. A
 * bare uuid failed its guard and decoded to `undefined`, so the `afterCursor`
 * predicate was dropped and **page two was page one again**, forever.
 *
 * ⚠️ Nothing caught it for weeks because the cursor primitives had thorough
 * tests of their own and every module test asked for ONE page. The helper was
 * correct; the callers never used it. A test that stops at the first page cannot
 * see that, so this one follows the cursor to exhaustion and asserts the rows
 * are distinct.
 */
describe("list paging", () => {
	it("returns a different second page, following its own cursor", async () => {
		const first = await listBookingsPage(workspaceId, {
			limit: 2,
			sort: "title",
			direction: "asc",
		});
		expect(first.items).toHaveLength(2);
		expect(first.page.hasMore).toBe(true);
		expect(first.page.nextCursor).toBeTruthy();

		const second = await listBookingsPage(workspaceId, {
			limit: 2,
			sort: "title",
			direction: "asc",
			cursor: first.page.nextCursor ?? undefined,
		});

		// The whole bug in one assertion.
		expect(second.items.map((b) => b.title)).not.toEqual(
			first.items.map((b) => b.title),
		);
		expect(second.items.map((b) => b.title)).toEqual(["charlie", "delta"]);
	});

	it("walks every row exactly once and then stops", async () => {
		const seen: string[] = [];
		let cursor: string | undefined;

		// Bounded rather than `while (true)`: before the fix this loop never
		// ended, and a hanging test is a worse failure report than a wrong one.
		for (let request = 0; request < 10; request += 1) {
			const page = await listBookingsPage(workspaceId, {
				limit: 2,
				sort: "title",
				direction: "asc",
				cursor,
			});
			seen.push(...page.items.map((b) => b.title));
			if (!page.page.hasMore) break;
			cursor = page.page.nextCursor ?? undefined;
		}

		expect(seen).toEqual(NAMES);
		expect(new Set(seen).size).toBe(NAMES.length);
	});

	it("hands back a cursor its own reader can decode", async () => {
		// The precise defect: a bare uuid parses to `undefined` and silently
		// drops the predicate rather than failing, which is why this was invisible.
		const first = await listBookingsPage(workspaceId, {
			limit: 2,
			sort: "title",
			direction: "asc",
		});
		expect(first.page.nextCursor).not.toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});
});
