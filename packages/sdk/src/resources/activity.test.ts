import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const page = {
	events: [
		{
			seq: 41,
			id: "00000000-0000-4000-8000-000000000001",
			workspaceId: "workspace_123",
			name: "invoice.paid",
			recordId: "inv_1",
			actorId: "user_1",
			occurredAt: "2026-07-25T12:00:00.000Z",
		},
	],
	cursor: 41,
};

const server = () => {
	// Fresh Response per call: a body can only be read once.
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(
			async () => new Response(JSON.stringify({ data: page }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("activity resource", () => {
	it("reads the newest events with no arguments", async () => {
		const { quick, fetcher } = server();
		await quick.activity.list();
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/activity",
		);
	});

	it("pages forward from a cursor", async () => {
		const { quick, fetcher } = server();
		await quick.activity.since(41);
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/activity?since=41",
		);
	});

	it("carries a limit through on both paths", async () => {
		const { quick, fetcher } = server();
		await quick.activity.list({ limit: 10 });
		await quick.activity.since(41, { limit: 10 });
		expect(fetcher.mock.calls[0]?.[0]).toContain("limit=10");
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://api.quickengine.test/v1/activity?since=41&limit=10",
		);
	});

	it("returns a cursor the caller can page from next", async () => {
		const { quick } = server();
		const result = await quick.activity.list();
		// The whole point: recovery needs a position, not just a list.
		expect(result.data.cursor).toBe(41);
		expect(result.data.events[0].name).toBe("invoice.paid");
	});

	it("treats cursor 0 as a real starting point, not a missing one", async () => {
		const { quick, fetcher } = server();
		await quick.activity.since(0);
		// A first-time client asks from zero; dropping it would silently return the
		// newest page instead of the whole history.
		expect(fetcher.mock.calls[0]?.[0]).toContain("since=0");
	});
});
