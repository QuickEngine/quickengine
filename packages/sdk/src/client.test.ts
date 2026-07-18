import { describe, expect, it, vi } from "vitest";
import { createQuickBrowser, createQuickServer, QuickApiError } from "./index";

describe("Quick.js client", () => {
	it("scopes a server request and preserves protected headers", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { "Request-Id": "req_123" },
			}),
		);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test/",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "secret_123" },
			fetcher,
		});

		const result = await quick.request<{ items: unknown[] }>("/clients", {
			headers: {
				Authorization: "Bearer attacker",
				"QuickEngine-Workspace": "another_workspace",
			},
		});

		expect(result).toEqual({ data: { items: [] }, requestId: "req_123" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/clients");
		const headers = new Headers(init?.headers);
		expect(headers.get("Authorization")).toBe("Bearer secret_123");
		expect(headers.get("QuickEngine-Workspace")).toBe("workspace_123");
	});

	it("uses publishable keys without exposing a bearer credential", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 204 }));
		const quick = createQuickBrowser({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "publishable", key: "pk_123" },
			fetcher,
		});

		await quick.request<void>("/events", {
			method: "POST",
			body: { name: "page_view" },
			idempotencyKey: "event_123",
		});

		const [, init] = fetcher.mock.calls[0] ?? [];
		const headers = new Headers(init?.headers);
		expect(headers.get("Authorization")).toBeNull();
		expect(headers.get("QuickEngine-Publishable-Key")).toBe("pk_123");
		expect(headers.get("Idempotency-Key")).toBe("event_123");
		expect(init?.body).toBe(JSON.stringify({ name: "page_view" }));
	});

	it("uses cookies explicitly for account sessions", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
		const quick = createQuickBrowser({
			baseUrl: "http://localhost:3011",
			workspaceId: "workspace_123",
			credential: { type: "session" },
			fetcher,
		});

		await quick.request("/workspace");

		expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
	});

	it("returns structured API failures with request correlation", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: "workspace_forbidden",
					message: "Workspace access denied",
					details: { workspaceId: "workspace_123" },
				}),
				{
					status: 403,
					statusText: "Forbidden",
					headers: { "Request-Id": "req_denied" },
				},
			),
		);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "scoped", token: "token_123" },
			fetcher,
		});

		const error = await quick.request("/clients").catch((cause) => cause);

		expect(error).toBeInstanceOf(QuickApiError);
		expect(error).toMatchObject({
			code: "workspace_forbidden",
			status: 403,
			requestId: "req_denied",
			details: { workspaceId: "workspace_123" },
		});
	});

	it("rejects absolute and protocol-relative request paths", async () => {
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "secret_123" },
			fetcher: vi.fn<typeof fetch>(),
		});

		await expect(quick.request("https://attacker.test/steal")).rejects.toThrow(
			"root-relative",
		);
		await expect(quick.request("//attacker.test/steal")).rejects.toThrow(
			"root-relative",
		);
	});
});
