import assert from "node:assert/strict";
import test from "node:test";

import { nextCalver } from "./next-calver.mjs";

test("starts the first monthly release at one", () => {
	assert.equal(nextCalver([], 2026, 7), "2026.7.1");
});

test("increments the highest counter in the current month", () => {
	assert.equal(nextCalver(["2026.7.1", "2026.7.3", "2026.7.2"], 2026, 7), "2026.7.4");
});

test("resets the counter for a new month", () => {
	assert.equal(nextCalver(["2026.7.9"], 2026, 8), "2026.8.1");
});

test("ignores unrelated, malformed, and prefixed tags", () => {
	assert.equal(
		nextCalver(["v2026.7.8", "2026.07", "latest", "2026.7.beta", "2025.7.20"], 2026, 7),
		"2026.7.1"
	);
});

test("treats a zero-padded month as the same calendar month", () => {
	assert.equal(nextCalver(["2026.07.2"], 2026, 7), "2026.7.3");
});

test("rejects invalid calendar inputs", () => {
	assert.throws(() => nextCalver([], 2026, 13), /month/);
	assert.throws(() => nextCalver([], 0, 1), /year/);
});
