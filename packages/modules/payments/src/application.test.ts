import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { recordPaymentCommand, refundPaymentCommand } from "./application";

const ownerId = "payments-owner";
const workspaceId = "00000000-0000-4000-8000-0000000011a1";

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

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Payments Owner', 'payments@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Payments Workspace', 'agency')
	`;
});

describe("Payments durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await recordPaymentCommand(
			context("payments.record", "pay-1"),
			{ amountCents: 10_000 },
		);
		const replay = await recordPaymentCommand(
			context("payments.record", "pay-1"),
			{ amountCents: 10_000 },
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
				(select count(*)::int from payments where workspace_id = ${workspaceId}) payments,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			payments: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await recordPaymentCommand(context("payments.record", "pay-2"), {
			amountCents: 10_000,
		});
		const conflict = await recordPaymentCommand(
			context("payments.record", "pay-2", "different"),
			{ amountCents: 20_000 },
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("refunds a succeeded payment and blocks over-refunding", async () => {
		const recorded = await recordPaymentCommand(
			context("payments.record", "pay-3"),
			{ amountCents: 10_000, status: "succeeded" },
		);
		const id =
			recorded.kind === "success" ? (recorded.result as { id: string }).id : "";

		const refund = await refundPaymentCommand(
			context("payments.refund", "pay-3-refund"),
			id,
			{ amountCents: 4_000 },
		);
		expect(refund).toMatchObject({ kind: "success", status: 201 });

		await expect(
			refundPaymentCommand(context("payments.refund", "pay-3-over"), id, {
				amountCents: 9_000,
			}),
		).rejects.toThrow(/more than the payment/);
	});
});
