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
});
