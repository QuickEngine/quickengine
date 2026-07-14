import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { getWorkspaceReport, recordTrafficEvent } from "../src";

const ownerId = "reporting-owner";
const workspaceId = "00000000-0000-4000-8000-000000000501";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000502";
const clientId = "00000000-0000-4000-8000-000000000503";

const range = {
	from: new Date("2026-07-01T00:00:00.000Z"),
	to: new Date("2026-08-01T00:00:00.000Z"),
	timeZone: "America/Mexico_City",
} as const;

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Reporting Owner', 'reporting@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Reporting Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values
			(${workspaceId}, 'client-records', true),
			(${workspaceId}, 'invoicing', true),
			(${workspaceId}, 'payments', true),
			(${workspaceId}, 'fulfillment', true),
			(${workspaceId}, 'reporting-analytics', true)
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, created_at)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', '2026-07-03T12:00:00Z')
	`;
	await sql`
		insert into invoices (workspace_id, client_id, number, status, currency, total_cents, issued_at, paid_at)
		values
			(${workspaceId}, ${clientId}, 'INV-0001', 'paid', 'USD', 10000, '2026-07-04T12:00:00Z', '2026-07-05T12:00:00Z'),
			(${workspaceId}, ${clientId}, 'INV-0002', 'sent', 'EUR', 7000, '2026-07-06T12:00:00Z', null)
	`;
	await sql`
		insert into payments (workspace_id, client_id, amount_cents, currency, status, succeeded_at, refunded_at)
		values
			(${workspaceId}, ${clientId}, 10000, 'USD', 'succeeded', '2026-07-05T12:00:00Z', null),
			(${workspaceId}, ${clientId}, 2500, 'EUR', 'refunded', '2026-07-07T12:00:00Z', '2026-07-10T12:00:00Z')
	`;
});

describe("Reporting & Analytics persistence", () => {
	it("keeps currencies separate and marks disabled module sections unavailable", async () => {
		const report = await getWorkspaceReport(workspaceId, range);
		expect(report.clients).toEqual({
			available: true,
			data: { total: 1, newInRange: 1 },
		});
		expect(report.invoices).toMatchObject({
			available: true,
			data: expect.arrayContaining([
				expect.objectContaining({
					currency: "USD",
					paidCents: "10000",
					outstandingCents: "0",
				}),
				expect.objectContaining({
					currency: "EUR",
					paidCents: "0",
					outstandingCents: "7000",
				}),
			]),
		});
		expect(report.payments).toMatchObject({
			available: true,
			data: expect.arrayContaining([
				expect.objectContaining({
					currency: "USD",
					collectedCents: "10000",
					refundedCents: "0",
				}),
				expect.objectContaining({
					currency: "EUR",
					collectedCents: "2500",
					refundedCents: "2500",
				}),
			]),
		});
		expect(report.orders).toEqual({ available: false, data: null });
	});

	it("deduplicates traffic events and never stores raw visitor identifiers", async () => {
		const now = new Date("2026-07-14T12:00:00.000Z");
		const input = {
			eventId: "event-0001",
			siteKey: "main-site",
			visitorId: "visitor-private-0001",
			sessionId: "session-private-0001",
			path: "/pricing",
			referrerHost: "example.com",
			occurredAt: new Date("2026-07-14T11:00:00.000Z"),
		};
		expect(await recordTrafficEvent(workspaceId, input, { now })).toEqual({
			accepted: true,
			eventId: input.eventId,
		});
		expect(await recordTrafficEvent(workspaceId, input, { now })).toEqual({
			accepted: false,
			eventId: input.eventId,
		});
		const sql = testDbClient();
		const [stored] = await sql`
			select visitor_hash, session_hash from reporting_traffic_events
			where workspace_id = ${workspaceId}
		`;
		expect(stored.visitor_hash).toHaveLength(64);
		expect(stored.session_hash).toHaveLength(64);
		expect(stored.visitor_hash).not.toBe(input.visitorId);
		const report = await getWorkspaceReport(workspaceId, range);
		expect(report.traffic.data.summary).toEqual({
			pageViews: 1,
			visitors: 1,
			sessions: 1,
		});
		expect(report.traffic.data.series).toEqual([
			expect.objectContaining({ pageViews: 1, visitors: 1, sessions: 1 }),
		]);
	});

	it("rejects tenant confusion and impossible traffic timestamps", async () => {
		await expect(
			getWorkspaceReport("00000000-0000-4000-8000-999999999999", range),
		).rejects.toThrow("WORKSPACE_NOT_FOUND");
		await expect(
			recordTrafficEvent(
				otherWorkspaceId,
				{
					eventId: "event-future",
					siteKey: "main-site",
					visitorId: "visitor-0001",
					sessionId: "session-0001",
					path: "/",
					occurredAt: new Date("2026-07-14T13:00:00.000Z"),
				},
				{ now: new Date("2026-07-14T12:00:00.000Z") },
			),
		).rejects.toThrow("TRAFFIC_EVENT_IN_FUTURE");
		await expect(
			recordTrafficEvent(
				otherWorkspaceId,
				{
					eventId: "event-disabled",
					siteKey: "main-site",
					visitorId: "visitor-0001",
					sessionId: "session-0001",
					path: "/",
					occurredAt: new Date("2026-07-14T11:00:00.000Z"),
				},
				{ now: new Date("2026-07-14T12:00:00.000Z") },
			),
		).rejects.toThrow("REPORTING_ANALYTICS_NOT_ENABLED");
	});
});
