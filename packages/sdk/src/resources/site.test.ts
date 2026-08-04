import { describe, expect, it, vi } from "vitest";
import { createQuickConnect } from "../index";

const response = (data: unknown, status = 200) =>
	new Response(JSON.stringify({ data, meta: { requestId: "req_connect" } }), {
		status,
		headers: { "Request-Id": "req_connect" },
	});

describe("QuickConnect", () => {
	it("carries only the public site key and optional customer session", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ workspace: { name: "Gem Shop" } }));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: {
				type: "site",
				key: "qsf_public_123",
				customerSession: "customer_session_123",
			},
			fetcher,
		});

		await quick.site.context();

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickdash.xyz/v1/customer/context");
		const headers = new Headers(init?.headers);
		expect(headers.get("QuickEngine-Workspace")).toBe("workspace_123");
		expect(headers.get("QuickEngine-Publishable-Key")).toBe("qsf_public_123");
		expect(headers.get("QuickEngine-Customer-Session")).toBe(
			"customer_session_123",
		);
		expect(headers.get("Authorization")).toBeNull();
	});

	it("creates a checkout with one explicit idempotency key", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ order: { id: "order_123" } }, 201));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: { type: "site", key: "qsf_public_123" },
			fetcher,
		});
		const input = {
			items: [{ catalogItemId: "item_123", quantity: 1 }],
			email: "customer@example.com",
		};

		await quick.site.checkout(input, "checkout_attempt_123");

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickdash.xyz/v1/checkout");
		expect(init?.method).toBe("POST");
		expect(init?.body).toBe(JSON.stringify(input));
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"checkout_attempt_123",
		);
	});

	it("reads authoritative catalog availability without an operator key", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: { type: "site", key: "qsf_public_123" },
			fetcher,
		});

		await quick.site.availability(["item_1", "item_2"]);

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickdash.xyz/v1/catalog/availability");
		expect(init?.method).toBe("POST");
		expect(init?.body).toBe(
			JSON.stringify({ catalogItemIds: ["item_1", "item_2"] }),
		);
	});

	it("reads only the signed-in customer's requested order", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ id: "order_123", shipments: [] }));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: {
				type: "site",
				key: "qsf_public_123",
				customerSession: "customer_session_123",
			},
			fetcher,
		});

		await quick.customer.getOrder("order/with spaces");

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickdash.xyz/v1/customer/orders/order%2Fwith%20spaces",
		);
	});

	it("can request a magic link before a customer session exists", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ sent: true }));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: { type: "site", key: "qsf_public_123" },
			fetcher,
		});

		await quick.customer.requestSignInLink("customer@example.com");

		const [, init] = fetcher.mock.calls[0] ?? [];
		expect(init?.method).toBe("POST");
		expect(init?.body).toBe(JSON.stringify({ email: "customer@example.com" }));
	});

	it("can return a magic link to the storefront's registered callback", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ sent: true }));
		const quick = createQuickConnect({
			baseUrl: "https://api.quickdash.xyz",
			workspaceId: "workspace_123",
			credential: { type: "site", key: "qsf_public_123" },
			fetcher,
		});

		await quick.customer.requestSignInLink(
			"customer@example.com",
			"https://gemsutopia.ca/auth/verify",
		);

		const [, init] = fetcher.mock.calls[0] ?? [];
		expect(init?.body).toBe(
			JSON.stringify({
				email: "customer@example.com",
				callbackUrl: "https://gemsutopia.ca/auth/verify",
			}),
		);
	});
});
