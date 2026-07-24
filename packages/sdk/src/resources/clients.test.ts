import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

describe("clients resource", () => {
	it("creates a client with a private credential and idempotency key", async () => {
		const client = {
			id: "00000000-0000-4000-8000-000000000701",
			workspaceId: "workspace_123",
			name: "Ada Example",
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: client, meta: { requestId: "req_client" } }),
					{ status: 201, headers: { "X-Request-Id": "req_client" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "secret_123" },
			fetcher,
		});

		const result = await quick.clients.create(
			{ name: "Ada Example" },
			"client-create-123",
		);

		expect(result).toEqual({ data: client, requestId: "req_client" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/clients");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"client-create-123",
		);
	});
});
