import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type AlgoliaClient,
	createAlgoliaSearchProvider,
	getSearchProvider,
	resetSearchProviderForTests,
} from "../src";

function fakeClient() {
	const saveObjects = vi.fn().mockResolvedValue(undefined);
	const deleteObjects = vi.fn().mockResolvedValue(undefined);
	const setSettings = vi.fn().mockResolvedValue(undefined);
	const searchSingleIndex = vi.fn().mockResolvedValue({
		hits: [
			{ objectID: "rec-1", title: "Ada", workspaceId: "ws-1" },
			{ objectID: "rec-2", title: "Grace", workspaceId: "ws-1" },
		],
	});
	const client: AlgoliaClient = {
		saveObjects,
		deleteObjects,
		setSettings,
		searchSingleIndex,
	};
	return { client, saveObjects, deleteObjects, setSettings, searchSingleIndex };
}

describe("createAlgoliaSearchProvider", () => {
	it("indexes records, flattening metadata to top-level attributes", async () => {
		const fake = fakeClient();
		const provider = createAlgoliaSearchProvider(fake.client);

		await provider.index("quickdash", [
			{
				objectID: "rec-1",
				title: "Ada Lovelace",
				description: "ada@example.com",
				metadata: { workspaceId: "ws-1", module: "client-records" },
			},
		]);

		expect(fake.saveObjects).toHaveBeenCalledWith({
			indexName: "quickdash",
			objects: [
				{
					objectID: "rec-1",
					title: "Ada Lovelace",
					description: "ada@example.com",
					workspaceId: "ws-1",
					module: "client-records",
				},
			],
		});
	});

	it("skips empty index/remove calls", async () => {
		const fake = fakeClient();
		const provider = createAlgoliaSearchProvider(fake.client);
		await provider.index("quickdash", []);
		await provider.remove("quickdash", []);
		expect(fake.saveObjects).not.toHaveBeenCalled();
		expect(fake.deleteObjects).not.toHaveBeenCalled();
	});

	it("removes by objectID", async () => {
		const fake = fakeClient();
		const provider = createAlgoliaSearchProvider(fake.client);
		await provider.remove("quickdash", ["rec-1", "rec-2"]);
		expect(fake.deleteObjects).toHaveBeenCalledWith({
			indexName: "quickdash",
			objectIDs: ["rec-1", "rec-2"],
		});
	});

	it("searches with the workspace filter applied", async () => {
		const fake = fakeClient();
		const provider = createAlgoliaSearchProvider(fake.client);

		const results = await provider.search({
			index: "quickdash",
			query: "ada",
			limit: 5,
			filters: { workspaceId: "ws-1" },
		});

		expect(fake.searchSingleIndex).toHaveBeenCalledWith({
			indexName: "quickdash",
			searchParams: {
				query: "ada",
				hitsPerPage: 5,
				filters: 'workspaceId:"ws-1"',
			},
		});
		expect(results.map((r) => r.objectID)).toEqual(["rec-1", "rec-2"]);
	});

	it("configures filterable attributes as filterOnly facets", async () => {
		const fake = fakeClient();
		const provider = createAlgoliaSearchProvider(fake.client);
		await provider.configure("quickdash", {
			filterableAttributes: ["workspaceId"],
		});
		expect(fake.setSettings).toHaveBeenCalledWith({
			indexName: "quickdash",
			indexSettings: { attributesForFaceting: ["filterOnly(workspaceId)"] },
		});
	});
});

describe("getSearchProvider", () => {
	const original = {
		ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
		ALGOLIA_ADMIN_KEY: process.env.ALGOLIA_ADMIN_KEY,
	};

	afterEach(() => {
		for (const [k, v] of Object.entries(original)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		resetSearchProviderForTests();
	});

	it("returns the offline no-op provider when Algolia isn't configured", async () => {
		delete process.env.ALGOLIA_APP_ID;
		delete process.env.ALGOLIA_ADMIN_KEY;
		resetSearchProviderForTests();

		const provider = getSearchProvider();
		// No-op search resolves to no hits without any client.
		await expect(
			provider.search({ index: "quickdash", query: "x" }),
		).resolves.toEqual([]);
		expect(getSearchProvider()).toBe(provider); // memoized
	});
});
