import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const booking = {
	id: "00000000-0000-4000-8000-0000000017a1",
	workspaceId: "workspace_123",
	clientId: "00000000-0000-4000-8000-0000000017b1",
	clientName: "Booking Client",
	title: "Consultation",
	status: "requested" as const,
	scheduleKey: "default",
	startsAt: "2026-08-01T10:00:00.000Z",
	endsAt: "2026-08-01T11:00:00.000Z",
	timeZone: "UTC",
	locationKind: "in_person" as const,
	location: null,
	cancellationReason: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = booking) => {
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

describe("bookings resource", () => {
	it("serializes a Date window into ISO query params", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.bookings.list({
			from: new Date("2026-08-01T00:00:00.000Z"),
			to: new Date("2026-08-02T00:00:00.000Z"),
			scheduleKey: "room-two",
		});
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/bookings?scheduleKey=room-two&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-02T00%3A00%3A00.000Z",
		);
	});

	it("accepts a string window unchanged", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.bookings.list({ from: "2026-08-01T00:00:00.000Z" });
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/bookings?from=2026-08-01T00%3A00%3A00.000Z",
		);
	});

	it("books a slot with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.bookings.create(
			{
				clientId: booking.clientId,
				title: "Consultation",
				startsAt: booking.startsAt,
				endsAt: booking.endsAt,
				timeZone: "UTC",
			},
			"bkg-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/bookings");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"bkg-create-1",
		);
	});

	it("carries a cancellation reason through the status route", async () => {
		const { quick, fetcher } = server();
		await quick.bookings.setStatus(booking.id, "cancelled", "bkg-cancel-1", {
			cancellationReason: "Client rescheduled",
		});
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/bookings/${booking.id}/status`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			status: "cancelled",
			cancellationReason: "Client rescheduled",
		});
	});
});
