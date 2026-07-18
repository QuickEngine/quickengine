import { describe, expect, it, vi } from "vitest";
import { createQuickBrowser } from "../index";

describe("events resource", () => {
	it("records a traffic event over POST /v1/events with occurredAt as ISO", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({ accepted: true, eventId: "evt_123456789" }),
				{
					status: 200,
				},
			),
		);
		const quick = createQuickBrowser({
			baseUrl: "https://dash.quickengine.test/api",
			workspaceId: "workspace_123",
			credential: { type: "publishable", key: "qpk_abc" },
			fetcher,
		});

		const occurredAt = new Date("2026-07-18T12:00:00.000Z");
		const result = await quick.events.record({
			eventId: "evt_123456789",
			siteKey: "gemsutopia",
			visitorId: "visitor_abcdef",
			sessionId: "session_abcdef",
			path: "/products/aurora",
			occurredAt,
		});

		expect(result.data).toEqual({ accepted: true, eventId: "evt_123456789" });
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://dash.quickengine.test/api/v1/events");
		expect(init?.method).toBe("POST");
		// The Date is serialized to an ISO string in the JSON body.
		expect(JSON.parse(String(init?.body)).occurredAt).toBe(
			"2026-07-18T12:00:00.000Z",
		);
		const headers = new Headers(init?.headers);
		expect(headers.get("QuickEngine-Publishable-Key")).toBe("qpk_abc");
	});
});
