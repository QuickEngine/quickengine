import {
	afterCursor,
	and,
	db,
	decodeCursor,
	encodeCursor,
	eq,
	pageOrder,
	productEvents,
	toPage,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Keyset paging across a non-unique sort column.
 *
 * `product_events` is used as the fixture because it already has a text column
 * that ties freely (`name`) and a unique id — exactly the shape that breaks
 * naive cursor paging.
 */
const SURFACE = "cursor-fixture";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`delete from product_events where surface = ${SURFACE}`;
	// Six rows, three sharing one sort value and three sharing another. A page
	// boundary lands INSIDE a tie, which is where naive paging loses rows.
	await sql`
		insert into product_events (name, surface, occurred_at)
		values
			('signup.viewed', ${SURFACE}, now()),
			('signup.viewed', ${SURFACE}, now()),
			('signup.viewed', ${SURFACE}, now()),
			('workspace.created', ${SURFACE}, now()),
			('workspace.created', ${SURFACE}, now()),
			('workspace.created', ${SURFACE}, now())
	`;
});

const readPage = async (cursor: string | undefined, limit: number) => {
	const rows = await db
		.select({ id: productEvents.id, name: productEvents.name })
		.from(productEvents)
		.where(
			and(
				eq(productEvents.surface, SURFACE),
				afterCursor(
					productEvents.name,
					productEvents.id,
					decodeCursor(cursor),
					"asc",
				),
			),
		)
		.orderBy(...pageOrder(productEvents.name, productEvents.id, "asc"))
		.limit(limit + 1);
	return toPage(rows, limit, "name", "id");
};

describe("compound cursor paging", () => {
	// 🔴 The bug this exists to prevent. Paging on the sort column alone skips
	// every row tied with the last row of a page; using `>=` repeats them. Neither
	// shows up with five records.
	it("returns every row exactly once when a page boundary lands inside a tie", async () => {
		const seen: string[] = [];
		let cursor: string | undefined;

		// Limit 2 across two groups of 3 forces boundaries inside both ties.
		for (let guard = 0; guard < 10; guard++) {
			const page = await readPage(cursor, 2);
			seen.push(...page.items.map((row) => row.id));
			if (!page.page.hasMore) break;
			cursor = page.page.nextCursor ?? undefined;
		}

		expect(seen).toHaveLength(6);
		expect(new Set(seen).size).toBe(6);
	});

	it("orders by the sort column, then the id", async () => {
		const page = await readPage(undefined, 10);
		const names = page.items.map((row) => row.name);
		expect(names).toEqual([...names].sort());
	});

	it("reports no cursor on the last page", async () => {
		const page = await readPage(undefined, 10);
		expect(page.page.hasMore).toBe(false);
		expect(page.page.nextCursor).toBeNull();
	});

	// Opaque so a caller cannot build one and defeat the guarantee.
	it("round-trips a cursor without exposing its parts", () => {
		const encoded = encodeCursor({ value: "signup.viewed", id: "abc" });
		expect(encoded).not.toContain("signup.viewed");
		expect(decodeCursor(encoded)).toEqual({
			value: "signup.viewed",
			id: "abc",
		});
	});

	// A half-formed cursor cannot produce a correct predicate, and guessing would
	// silently return the wrong page.
	it("treats a malformed cursor as absent rather than guessing", () => {
		expect(decodeCursor("not-base64!!")).toBeUndefined();
		expect(decodeCursor(encodeCursor({ value: "x", id: "" }))).toBeUndefined();
	});
});

describe("cursor encoding", () => {
	// 🔴 The bug this fixes. The first version joined with a space and split on
	// it, so "Acme Corporation" decoded as { value: "Acme", id: "Corporation" }
	// and the id half hit a uuid comparison. Every free-text sort column — client
	// name, catalog name, booking title, project name — was exposed, and no
	// fixture happened to contain a space.
	it.each([
		["a plain value", "alice"],
		["a value with a space", "Acme Corporation"],
		["a value with the delimiter", "a b: c 12:34"],
		["an empty value", ""],
		["only delimiters", ":::"],
		["a very long value", "x".repeat(300)],
	])("round-trips %s", (_label, value) => {
		const id = "11111111-2222-4333-8444-555555555555";
		expect(decodeCursor(encodeCursor({ value, id }))).toEqual({ value, id });
	});
});
