import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const report = {
	workspace: { id: "workspace_123", name: "Reporting Workspace" },
	range: {
		from: "2026-06-24T00:00:00.000Z",
		to: "2026-07-24T00:00:00.000Z",
		timeZone: "UTC",
		granularity: "day",
	},
	clients: { available: true, data: { total: 1, newInRange: 1 } },
	invoices: { available: false, data: null },
};

const server = (payload: unknown = report) => {
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

describe("reports resource", () => {
	it("asks for a report with no arguments at all", async () => {
		const { quick, fetcher } = server();
		await quick.reports.workspace();
		// No query string: the server applies the default range.
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/reports/workspace",
		);
	});

	it("serializes a Date range into ISO query params", async () => {
		const { quick, fetcher } = server();
		await quick.reports.revenue({
			from: new Date("2026-07-01T00:00:00.000Z"),
			to: new Date("2026-08-01T00:00:00.000Z"),
			granularity: "week",
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/reports/revenue?from=2026-07-01T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.000Z&granularity=week",
		);
	});

	it("passes a string range through unchanged", async () => {
		const { quick, fetcher } = server();
		await quick.reports.traffic({
			from: "2026-07-01T00:00:00.000Z",
			timeZone: "America/Mexico_City",
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/reports/traffic?from=2026-07-01T00%3A00%3A00.000Z&timeZone=America%2FMexico_City",
		);
	});

	it("distinguishes an unavailable section from an empty one", async () => {
		const { quick } = server();
		const result = await quick.reports.workspace();
		// A caller must be able to tell "invoicing is off" from "no invoices yet".
		expect(result.data.invoices).toEqual({ available: false, data: null });
		expect(result.data.clients).toMatchObject({ available: true });
	});

	it("reads the traffic summary from its own route", async () => {
		const { quick, fetcher } = server({ views: 0, visitors: 0, sessions: 0 });
		await quick.reports.trafficSummary();
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/reports/traffic/summary",
		);
	});
});
