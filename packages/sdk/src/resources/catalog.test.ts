import { describe, expect, it, vi } from "vitest";
import { createQuickBrowser, createQuickServer } from "../index";

const item = {
	id: "00000000-0000-4000-8000-0000000007a1",
	workspaceId: "workspace_123",
	name: "Aurora Pendant",
	description: null,
	type: "physical" as const,
	status: "active" as const,
	sku: "AUR-01",
	pricingModel: "fixed" as const,
	priceCents: 4200,
	currency: "USD",
	unitLabel: null,
	metadata: {},
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

describe("catalog resource", () => {
	it("lists a workspace's catalog as a cursor page over GET /v1/catalog", async () => {
		const page = { items: [item], page: { hasMore: false, nextCursor: null } };
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: page, meta: { requestId: "req_c" } }),
					{ status: 200, headers: { "Request-Id": "req_c" } },
				),
			);
		const quick = createQuickBrowser({
			baseUrl: "https://dash.quickengine.test/api",
			workspaceId: "workspace_123",
			credential: { type: "session" },
			fetcher,
		});

		const result = await quick.catalog.list({ limit: 10 });

		expect(result).toEqual({ data: page, requestId: "req_c" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://dash.quickengine.test/api/v1/catalog?limit=10");
		expect(init?.method).toBe("GET");
		expect(new Headers(init?.headers).get("QuickEngine-Workspace")).toBe(
			"workspace_123",
		);
	});

	it("creates a catalog item with a private credential and idempotency key", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: item, meta: { requestId: "req_new" } }),
					{ status: 201, headers: { "Request-Id": "req_new" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.catalog.create(
			{
				name: "Aurora Pendant",
				type: "physical",
				pricingModel: "fixed",
				priceCents: 4200,
			},
			"catalog-create-1",
		);

		expect(result).toEqual({ data: item, requestId: "req_new" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/catalog");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"catalog-create-1",
		);
	});

	it("moves an item between statuses over POST /v1/catalog/:id/status", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ data: { ...item, status: "archived" } }), {
				status: 200,
			}),
		);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		await quick.catalog.setStatus(item.id, "archived", "catalog-status-1");

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/catalog/${item.id}/status`,
		);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ status: "archived" });
	});

	it("creates a variant under an item over POST /v1/catalog/:id/variants", async () => {
		const variant = {
			id: "00000000-0000-4000-8000-0000000007b1",
			workspaceId: "workspace_123",
			catalogItemId: item.id,
			combinationKey: "size=large",
			options: [{ name: "Size", value: "Large" }],
			status: "draft" as const,
			sku: "AUR-01-L",
			priceCentsOverride: 4800,
			metadata: {},
			createdAt: item.createdAt,
			updatedAt: item.updatedAt,
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ data: variant }), { status: 201 }),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.catalog.createVariant(
			item.id,
			{ options: [{ name: "Size", value: "Large" }], sku: "AUR-01-L" },
			"variant-create-1",
		);

		expect(result.data).toEqual(variant);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/catalog/${item.id}/variants`,
		);
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"variant-create-1",
		);
	});
});
