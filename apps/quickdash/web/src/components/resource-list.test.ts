import { describe, expect, it } from "vitest";
import {
	buildResourceListPage,
	normalizeResourceListState,
} from "./resource-list";

const records = [
	{ name: "Gamma", status: "active", total: 30 },
	{ name: "Alpha", status: "draft", total: 10 },
	{ name: "Beta", status: "active", total: 20 },
];

describe("resource-list contract", () => {
	it("normalizes unsafe URL state", () => {
		expect(
			normalizeResourceListState({
				q: "x".repeat(250),
				status: "active",
				sort: "name",
				page: -2,
			}),
		).toEqual({
			q: "x".repeat(200),
			status: "active",
			sort: "name",
			page: 1,
		});
	});

	it("filters, sorts and paginates without changing the source", () => {
		const page = buildResourceListPage({
			items: records,
			state: { q: "a", status: "active", sort: "name", page: 1 },
			pageSize: 1,
			matches: (record, query) => record.name.toLowerCase().includes(query),
			inStatus: (record, status) => record.status === status,
			compare: (left, right) => left.name.localeCompare(right.name),
		});
		expect(page).toMatchObject({
			items: [{ name: "Beta", status: "active", total: 20 }],
			filteredCount: 2,
			totalCount: 3,
			page: 1,
			pageCount: 2,
		});
		expect(records.map((record) => record.name)).toEqual([
			"Gamma",
			"Alpha",
			"Beta",
		]);
	});

	it("clamps a stale URL page after filters reduce the result", () => {
		expect(
			buildResourceListPage({
				items: records,
				state: { q: "alpha", status: "all", sort: "default", page: 9 },
				pageSize: 2,
				matches: (record, query) => record.name.toLowerCase().includes(query),
			}),
		).toMatchObject({ page: 1, pageCount: 1, filteredCount: 1 });
	});
});
