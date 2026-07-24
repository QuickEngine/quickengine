import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const contract = {
	id: "00000000-0000-4000-8000-0000000019a1",
	workspaceId: "workspace_123",
	number: "CON-0001",
	title: "Design retainer",
	status: "draft" as const,
	clientId: "00000000-0000-4000-8000-0000000019b1",
	clientName: "Contract Client",
	seriesId: "00000000-0000-4000-8000-0000000019c1",
	supersedesId: null,
	sentAt: null,
	completedAt: null,
	expiresAt: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = contract) => {
	// Fresh Response per call: a body can only be read once.
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(
			async () =>
				new Response(JSON.stringify({ data: payload }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("contracts resource", () => {
	it("filters by client and status", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.contracts.list({
			clientId: contract.clientId,
			status: "sent",
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/contracts?clientId=${contract.clientId}&status=sent`,
		);
	});

	it("creates a contract with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.contracts.create(
			{ title: "Design retainer", clientId: contract.clientId },
			"con-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/contracts");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"con-create-1",
		);
	});

	// The security property this API is built around: a send response must never carry token
	// material, because a durable result is persisted for replay.
	it("returns invitation metadata without signing tokens when sending", async () => {
		const sent = {
			...contract,
			status: "sent" as const,
			invitations: [
				{
					signerId: "00000000-0000-4000-8000-0000000019d1",
					name: "Ada Lovelace",
					email: "ada@example.com",
					expiresAt: "2026-08-24T00:00:00.000Z",
				},
			],
		};
		const { quick, fetcher } = server(sent);

		const result = await quick.contracts.send(contract.id, "con-send-1");

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/contracts/${contract.id}/send`,
		);
		const invitation = result.data.invitations[0];
		expect(invitation).toMatchObject({ email: "ada@example.com" });
		expect(invitation).not.toHaveProperty("token");
		expect(JSON.stringify(result.data)).not.toContain("token");
	});

	it("revises a contract over its own route", async () => {
		const { quick, fetcher } = server();
		await quick.contracts.revise(contract.id, "con-revise-1");
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/contracts/${contract.id}/revise`,
		);
		expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
	});
});
