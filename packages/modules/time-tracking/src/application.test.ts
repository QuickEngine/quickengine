import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	approveTimeEntryCommand,
	createManualTimeEntryCommand,
	deleteTimeEntryCommand,
	startTimerCommand,
	stopTimerCommand,
	voidTimeEntryCommand,
} from "./application";

const ownerId = "time-owner";
const workspaceId = "00000000-0000-4000-8000-0000000018a1";
const clientId = "00000000-0000-4000-8000-0000000018b1";
const projectId = "00000000-0000-4000-8000-0000000018c1";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const manualInput = (overrides: Record<string, unknown> = {}) => ({
	projectId,
	workDate: "2026-08-01",
	durationSeconds: 3_600,
	...overrides,
});

// A timer may not start in the future, so these are anchored relative to now rather than to a
// fixed calendar date that would drift into the future as the clock moves.
const NOW = Date.now();
const agoMinutes = (minutes: number) => new Date(NOW - minutes * 60_000);

const timerInput = (overrides: Record<string, unknown> = {}) => ({
	projectId,
	startedAt: agoMinutes(120),
	timeZone: "UTC",
	...overrides,
});

const idOf = (result: { kind: string; result?: unknown }) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Time Owner', 'time@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Time Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name)
		values (${clientId}, ${workspaceId}, 'Time Client')
	`;
	await sql`
		insert into projects (id, workspace_id, client_id, name, status)
		values (${projectId}, ${workspaceId}, ${clientId}, 'Retainer', 'active')
	`;
});

describe("Time tracking durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createManualTimeEntryCommand(
			context("time.create", "tt-1"),
			manualInput(),
		);
		const replay = await createManualTimeEntryCommand(
			context("time.create", "tt-1"),
			manualInput(),
		);
		expect(first).toMatchObject({
			kind: "success",
			source: "executed",
			status: 201,
		});
		expect(replay).toMatchObject({
			kind: "success",
			source: "replayed",
			status: 201,
		});

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from time_entries where workspace_id = ${workspaceId}) entries,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			entries: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	// The distinction that matters for timers: replaying a call is safe, but genuinely asking
	// for a second concurrent timer is a conflict. These come from different mechanisms —
	// stored idempotency versus a Postgres unique index — so both are covered.
	it("replays a retried timer start rather than starting a second timer", async () => {
		const first = await startTimerCommand(
			context("time.start", "tt-2"),
			timerInput(),
		);
		const retry = await startTimerCommand(
			context("time.start", "tt-2"),
			timerInput(),
		);

		expect(first).toMatchObject({ kind: "success", source: "executed" });
		expect(retry).toMatchObject({ kind: "success", source: "replayed" });
		expect(idOf(retry)).toBe(idOf(first));

		const sql = testDbClient();
		const [counts] = await sql`
			select count(*)::int as running from time_entries
			where workspace_id = ${workspaceId} and status = 'running'
		`;
		expect(counts).toMatchObject({ running: 1 });
	});

	it("refuses a genuinely second timer on the same tracker with a readable conflict", async () => {
		await startTimerCommand(context("time.start", "tt-3"), timerInput());

		// A different idempotency key means this is a real second request, not a replay. A running
		// timer is open-ended, so every candidate start time overlaps it and the friendlier overlap
		// guard answers first. The `time_entries_one_running_tracker_idx` unique index sits behind
		// that as the concurrency backstop, for two simultaneous starts where neither transaction
		// can see the other's row yet — `mapTimeError` translates that raw driver error so the
		// racing caller still gets a conflict rather than a 500.
		await expect(
			startTimerCommand(
				context("time.start", "tt-3-second"),
				timerInput({ startedAt: agoMinutes(60) }),
			),
		).rejects.toThrow(/overlaps another entry on the same tracker/);
	});

	it("allows a separate timer on a different tracker", async () => {
		await startTimerCommand(context("time.start", "tt-4"), timerInput());

		const other = await startTimerCommand(
			context("time.start", "tt-4-other"),
			timerInput({
				trackerKey: "second-tracker",
				startedAt: agoMinutes(60),
			}),
		);
		expect(other).toMatchObject({ kind: "success", status: 201 });
	});

	it("stops a running timer and records its duration", async () => {
		const started = await startTimerCommand(
			context("time.start", "tt-5"),
			timerInput(),
		);
		const id = idOf(started);

		// Started 120 minutes ago, stopped 30 minutes ago => 90 minutes of tracked time.
		const stopped = await stopTimerCommand(
			context("time.stop", "tt-5-stop"),
			id,
			agoMinutes(30),
		);
		expect(stopped).toMatchObject({ kind: "success", status: 200 });

		const sql = testDbClient();
		const [entry] = await sql`
			select status, duration_seconds from time_entries where id = ${id}
		`;
		expect(entry).toMatchObject({ status: "draft", duration_seconds: 5_400 });
	});

	it("refuses to stop an entry that has no running timer", async () => {
		const id = idOf(
			await createManualTimeEntryCommand(
				context("time.create", "tt-6"),
				manualInput(),
			),
		);

		await expect(
			stopTimerCommand(context("time.stop", "tt-6-stop"), id, agoMinutes(30)),
		).rejects.toThrow(/doesn't have a running timer/);
	});

	it("refuses to delete approved time", async () => {
		const id = idOf(
			await createManualTimeEntryCommand(
				context("time.create", "tt-7"),
				manualInput(),
			),
		);
		await approveTimeEntryCommand(context("time.approve", "tt-7-approve"), id);

		await expect(
			deleteTimeEntryCommand(context("time.delete", "tt-7-del"), id),
		).rejects.toThrow(/can no longer be deleted/);
	});

	it("voids an entry instead of losing it", async () => {
		const id = idOf(
			await createManualTimeEntryCommand(
				context("time.create", "tt-8"),
				manualInput(),
			),
		);

		const voided = await voidTimeEntryCommand(
			context("time.void", "tt-8-void"),
			id,
		);
		expect(voided).toMatchObject({ kind: "success", status: 200 });

		const sql = testDbClient();
		const [entry] = await sql`select status from time_entries where id = ${id}`;
		expect(entry).toMatchObject({ status: "void" });
	});

	it("rolls the whole entry back when its project reference is invalid", async () => {
		await expect(
			createManualTimeEntryCommand(
				context("time.create", "tt-9"),
				manualInput({ projectId: "00000000-0000-4000-8000-0000000018ff" }),
			),
		).rejects.toThrow(/project on this entry was not found/);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from time_entries where workspace_id = ${workspaceId}) entries,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		expect(counts).toMatchObject({ entries: 0, audits: 0 });
	});
});
