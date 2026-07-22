import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedPackages = {
	"packages/sdk": "quick",
	"packages/cli": "cli",
	"packages/modules/bookings": "mod-bookings",
	"packages/modules/client-records": "mod-client-records",
	"packages/modules/contracts-esign": "mod-contracts-esign",
	"packages/modules/files": "mod-files",
	"packages/modules/fulfillment": "mod-fulfillment",
	"packages/modules/inventory": "mod-inventory",
	"packages/modules/invoicing": "mod-invoicing",
	"packages/modules/orders": "mod-orders",
	"packages/modules/payments": "mod-payments",
	"packages/modules/products-services": "mod-products-services",
	"packages/modules/projects-tasks": "mod-projects-tasks",
	"packages/modules/quotes-estimates": "mod-quotes-estimates",
	"packages/modules/reporting-analytics": "mod-reporting-analytics",
	"packages/modules/shipping": "mod-shipping",
	"packages/modules/time-tracking": "mod-time-tracking",
};

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

test("tracks exactly the shipped public package line from 0.1.0", async () => {
	const config = await readJson("release-please-config.json");
	const manifest = await readJson(".release-please-manifest.json");

	assert.deepEqual(
		Object.keys(config.packages).sort(),
		Object.keys(expectedPackages).sort(),
	);
	assert.deepEqual(
		Object.keys(manifest).sort(),
		Object.keys(expectedPackages).sort(),
	);
	assert.match(config["bootstrap-sha"], /^[a-f0-9]{40}$/);
	assert.equal(config["release-type"], "node");
	assert.equal(config["include-component-in-tag"], true);
	assert.equal(config["include-v-in-tag"], true);
	assert.deepEqual(config.plugins, ["node-workspace"]);

	for (const [path, component] of Object.entries(expectedPackages)) {
		assert.equal(manifest[path], "0.1.0");
		assert.equal(config.packages[path].component, component);
	}
});

test("declares every tracked package public without enabling npm publication", async () => {
	for (const path of Object.keys(expectedPackages)) {
		const packageJson = await readJson(`${path}/package.json`);
		assert.equal(packageJson.private, false, path);
		assert.equal(packageJson.publishConfig?.access, "public", path);
	}

	const workflow = await readFile(
		".github/workflows/package-release.yml",
		"utf8",
	);
	assert.doesNotMatch(workflow, /npm\s+publish/);
	assert.match(workflow, /secrets\.RELEASE_PLEASE_TOKEN/);
});
