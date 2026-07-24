import assert from "node:assert/strict";
import test from "node:test";
import {
	auditNextBoundaries,
	compareInventory,
	NEXT_ROUTE_BASELINE,
	SERVER_ACTION_BASELINE,
} from "./check-next-boundaries.mjs";

test("the repository matches the declared Next compatibility boundary", async () => {
	const result = await auditNextBoundaries();
	assert.deepEqual(result.errors, []);
	assert.equal(result.serverActions.size, 26);
	assert.equal(result.routes.size, 17);
});

test("new and stale compatibility files require an explicit baseline change", () => {
	const actual = new Map([["new.ts", 1]]);
	const errors = compareInventory(actual, new Map([["old.ts", 1]]), "adapter");
	assert.deepEqual(errors, [
		"Unapproved adapter: new.ts",
		"Stale adapter baseline (remove it deliberately): old.ts",
	]);
	assert.equal(SERVER_ACTION_BASELINE.size, 26);
	assert.equal(NEXT_ROUTE_BASELINE.size, 17);
});
