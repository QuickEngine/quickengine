import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const entry = {
	id: "00000000-0000-4000-8000-0000000018a1",
	workspaceId: "workspace_123",
	projectId: "00000000-0000-4000-8000-0000000018c1",
	taskId: null,
	trackerKey: "default",
	status: "running" as const,
	source: "timer" as const,
	description: null,
	billable: true,
	hourlyRateCents: null,
	currency: "USD",
	durationSeconds: 0,
	startedAt: "2026-07-24T09:00:00.000Z",
	endedAt: null,
	invoiceId: null,
	createdAt: "2026-07-24T09:00:00.000Z",
	updatedAt: "2026-07-24T09:00:00.000Z",
};

const server = (payload: unknown = entry) => {
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

describe("time resource", () => {
	it("filters entries by tracker and window", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.time.list({
			trackerKey: "default",
			status: "approved",
			from: new Date("2026-07-01T00:00:00.000Z"),
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/time-entries?trackerKey=default&status=approved&from=2026-07-01T00%3A00%3A00.000Z",
		);
	});

	it("starts a timer over POST /v1/timers", async () => {
		const { quick, fetcher } = server();
		await quick.time.startTimer(
			{
				projectId: entry.projectId,
				startedAt: entry.startedAt,
				timeZone: "UTC",
			},
			"timer-start-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/timers");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"timer-start-1",
		);
	});

	it("serializes a Date end time when stopping", async () => {
		const { quick, fetcher } = server();
		await quick.time.stopTimer(
			entry.id,
			new Date("2026-07-24T10:30:00.000Z"),
			"timer-stop-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(`https://api.quickengine.test/v1/timers/${entry.id}/stop`);
		expect(JSON.parse(String(init?.body))).toEqual({
			endedAt: "2026-07-24T10:30:00.000Z",
		});
	});

	it("carries rounding options through approve", async () => {
		const { quick, fetcher } = server();
		await quick.time.approve(entry.id, "time-approve-1", {
			mode: "up",
			incrementMinutes: 15,
		});
		const [, init] = fetcher.mock.calls[0] ?? [];
		expect(JSON.parse(String(init?.body))).toEqual({
			mode: "up",
			incrementMinutes: 15,
		});
	});

	it("attaches and detaches time on an invoice", async () => {
		const { quick, fetcher } = server({
			entryIds: [entry.id],
			invoiceId: "inv",
		});
		await quick.time.attachToInvoice("inv", [entry.id], "time-invoice-1");
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/time-entries/invoice",
		);

		await quick.time.detachFromInvoice("inv", [entry.id], "time-detach-1");
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://api.quickengine.test/v1/time-entries/detach",
		);
		expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
			invoiceId: "inv",
			entryIds: [entry.id],
		});
	});
});
