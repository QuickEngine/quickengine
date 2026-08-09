import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	assertPrivateOutputPath,
	formatProviderError,
	writePrivateJson,
} from "./recovery-safety.mjs";

test("provider failures never include response bodies", () => {
	assert.equal(
		formatProviderError("Neon", "POST", "/projects/project/branches", 401),
		"Neon POST /projects/project/branches failed with status 401",
	);
});

test("recovery artifacts cannot be written inside the repository", () => {
	const root = mkdtempSync(join(tmpdir(), "quickengine-repository-"));
	mkdirSync(join(root, "nested"));
	assert.throws(
		() => assertPrivateOutputPath(join(root, "nested", "recovery.json"), root),
		/outside the repository/,
	);
});

test("recovery artifacts are private, exclusive, and valid JSON", () => {
	const root = mkdtempSync(join(tmpdir(), "quickengine-repository-"));
	const destination = join(
		mkdtempSync(join(tmpdir(), "quickengine-recovery-")),
		"recovery.json",
	);

	writePrivateJson(destination, { workspaceId: "workspace-a", rows: 3 }, root);
	assert.deepEqual(JSON.parse(readFileSync(destination, "utf8")), {
		workspaceId: "workspace-a",
		rows: 3,
	});
	assert.equal(statSync(destination).mode & 0o777, 0o600);
	assert.throws(() => writePrivateJson(destination, {}, root), /EEXIST/);
});
