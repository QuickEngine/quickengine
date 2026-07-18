import { describe, expect, it, vi } from "vitest";
import { createQuickBrowser } from "../index";

describe("catalog resource", () => {
	it("lists a workspace's published catalog over GET /v1/catalog", async () => {
		const item = {
			id: "item_1",
			name: "Aurora Pendant",
			description: null,
			type: "physical" as const,
			sku: "AUR-01",
			pricingModel: "fixed" as const,
			priceCents: 4200,
			currency: "USD",
			unitLabel: null,
		};
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify([item]), {
				status: 200,
				headers: { "Request-Id": "req_catalog" },
			}),
		);
		const quick = createQuickBrowser({
			baseUrl: "https://dash.quickengine.test/api",
			workspaceId: "workspace_123",
			credential: { type: "session" },
			fetcher,
		});

		const result = await quick.catalog.list();

		expect(result).toEqual({ data: [item], requestId: "req_catalog" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://dash.quickengine.test/api/v1/catalog");
		expect(init?.method).toBe("GET");
		const headers = new Headers(init?.headers);
		expect(headers.get("QuickEngine-Workspace")).toBe("workspace_123");
	});

	it("fetches one item with variants over GET /v1/catalog/:id", async () => {
		const detail = {
			id: "item_1",
			name: "Aurora Pendant",
			description: null,
			type: "physical" as const,
			sku: "AUR-01",
			pricingModel: "fixed" as const,
			priceCents: 4200,
			currency: "USD",
			unitLabel: null,
			variants: [
				{
					id: "var_1",
					options: [{ name: "Size", value: "Large" }],
					sku: "AUR-01-L",
					priceCentsOverride: 4800,
				},
			],
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
		const quick = createQuickBrowser({
			baseUrl: "https://dash.quickengine.test/api",
			workspaceId: "workspace_123",
			credential: { type: "publishable", key: "qpk_abc" },
			fetcher,
		});

		const result = await quick.catalog.get("item 1/with?weird&chars");

		expect(result.data).toEqual(detail);
		const [url] = fetcher.mock.calls[0] ?? [];
		// The id is URL-encoded into the path.
		expect(url).toBe(
			"https://dash.quickengine.test/api/v1/catalog/item%201%2Fwith%3Fweird%26chars",
		);
	});
});
