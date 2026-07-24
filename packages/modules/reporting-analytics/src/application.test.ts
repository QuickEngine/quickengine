import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getRevenueSeriesDto,
	getWorkspaceReportDto,
	recordTrafficEventDto,
} from "./application";

const ownerId = "reporting-app-owner";
const workspaceId = "00000000-0000-4000-8000-000000001b01";
const disabledWorkspaceId = "00000000-0000-4000-8000-000000001b02";
const clientId = "00000000-0000-4000-8000-000000001b03";

// eventId / visitorId / sessionId all require >= 8 characters.
const trafficEvent = (overrides: Record<string, unknown> = {}) => ({
	eventId: "event-0001",
	siteKey: "storefront",
	visitorId: "visitor-0001",
	sessionId: "session-0001",
	path: "/products",
	referrerHost: null,
	occurredAt: new Date(),
	...overrides,
});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Reporting Owner', 'reporting-app@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Reporting Workspace', 'agency'),
			(${disabledWorkspaceId}, ${ownerId}, 'No Analytics Workspace', 'agency')
	`;
	// The second workspace deliberately has NO reporting-analytics row.
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values
			(${workspaceId}, 'client-records', true),
			(${workspaceId}, 'payments', true),
			(${workspaceId}, 'reporting-analytics', true)
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com')
	`;
});

describe("Reporting query contracts", () => {
	it("defaults to the last 30 days when no range is given", async () => {
		const report = await getWorkspaceReportDto(workspaceId, {});
		// A caller with no arguments still gets a usable report rather than a validation error.
		expect(report.clients).toMatchObject({ available: true });
	});

	it("rejects an unparseable date as a validation error, not a crash", async () => {
		await expect(
			getWorkspaceReportDto(workspaceId, { from: "not-a-date" }),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
			name: "DomainError",
		});
	});

	it("rejects an invalid time zone as a validation error", async () => {
		await expect(
			getWorkspaceReportDto(workspaceId, { timeZone: "Mars/Olympus_Mons" }),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});

	it("rejects a range whose end precedes its start", async () => {
		await expect(
			getWorkspaceReportDto(workspaceId, {
				from: "2026-08-01T00:00:00.000Z",
				to: "2026-07-01T00:00:00.000Z",
			}),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});

	// Series queries are workspace-scoped filters, so an unknown workspace yields nothing rather
	// than an error — the API authorizes workspace access before any query runs. The composite
	// report is deliberately stricter because it names the workspace in its output.
	it("returns nothing for an unknown workspace rather than leaking its absence", async () => {
		const series = await getRevenueSeriesDto(
			"00000000-0000-4000-8000-000000001bff",
			{},
		);
		expect(series).toEqual({ collected: [], refunded: [] });
	});

	it("reports a missing workspace as not found on the composite report", async () => {
		await expect(
			getWorkspaceReportDto("00000000-0000-4000-8000-000000001bff", {}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("marks sections unavailable rather than inventing zeroes", async () => {
		const report = await getWorkspaceReportDto(workspaceId, {});
		// invoicing was never enabled for this workspace.
		expect(report.invoices).toEqual({ available: false, data: null });
		expect(report.clients).toMatchObject({ available: true });
	});
});

describe("Traffic ingest", () => {
	it("is idempotent on eventId so a retried beacon is harmless", async () => {
		const first = await recordTrafficEventDto(workspaceId, trafficEvent());
		const repeat = await recordTrafficEventDto(workspaceId, trafficEvent());

		expect(first).toMatchObject({ accepted: true });
		expect(repeat).toMatchObject({ accepted: false });

		const sql = testDbClient();
		const [counts] = await sql`
			select count(*)::int as events from reporting_traffic_events
			where workspace_id = ${workspaceId}
		`;
		expect(counts).toMatchObject({ events: 1 });
	});

	// Telemetry deliberately does NOT go through the durable layer: it would add three rows and
	// an advisory lock per page view, and fill the audit trail with records that mean nothing.
	it("writes no mutation, audit, or outbox rows", async () => {
		await recordTrafficEventDto(
			workspaceId,
			trafficEvent({ eventId: "event-0002" }),
		);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({ mutations: 0, audits: 0, outbox: 0 });
	});

	it("hashes visitor and session ids rather than storing them", async () => {
		await recordTrafficEventDto(
			workspaceId,
			trafficEvent({
				eventId: "event-0003",
				visitorId: "raw-visitor-id-value",
			}),
		);

		const sql = testDbClient();
		const [row] = await sql`
			select visitor_hash, session_hash from reporting_traffic_events
			where workspace_id = ${workspaceId} and event_id = 'event-0003'
		`;
		expect(row.visitor_hash).not.toBe("raw-visitor-id-value");
		expect(row.visitor_hash).toMatch(/^[a-f0-9]{16,}$/);
		expect(row.session_hash).not.toBe(row.visitor_hash);
	});

	it("refuses an event dated in the future", async () => {
		await expect(
			recordTrafficEventDto(
				workspaceId,
				trafficEvent({
					eventId: "event-0004",
					occurredAt: new Date(Date.now() + 86_400_000),
				}),
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});

	it("refuses an event older than the retention window", async () => {
		await expect(
			recordTrafficEventDto(
				workspaceId,
				trafficEvent({
					eventId: "event-0005",
					occurredAt: new Date(Date.now() - 30 * 86_400_000),
				}),
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});

	it("refuses ingest when the module isn't enabled for the workspace", async () => {
		await expect(
			recordTrafficEventDto(disabledWorkspaceId, trafficEvent()),
		).rejects.toMatchObject({ code: "MODULE_DISABLED" });
	});
});
