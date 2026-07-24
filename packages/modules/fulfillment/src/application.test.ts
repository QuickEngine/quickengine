import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createFulfillmentCommand,
	deleteFulfillmentCommand,
	setFulfillmentStatusCommand,
} from "./application";

const ownerId = "fulfillment-owner";
const workspaceId = "00000000-0000-4000-8000-0000000013a1";

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

const idOf = (result: Awaited<ReturnType<typeof createFulfillmentCommand>>) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Fulfillment Owner', 'fulfillment@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Fulfillment Workspace', 'ecommerce')
	`;
});

describe("Fulfillment durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createFulfillmentCommand(
			context("fulfillments.create", "ful-1"),
			{ title: "Ship the order", kind: "physical" },
		);
		const replay = await createFulfillmentCommand(
			context("fulfillments.create", "ful-1"),
			{ title: "Ship the order", kind: "physical" },
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
				(select count(*)::int from fulfillments where workspace_id = ${workspaceId}) fulfillments,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			fulfillments: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createFulfillmentCommand(context("fulfillments.create", "ful-2"), {
			title: "First",
		});
		const conflict = await createFulfillmentCommand(
			context("fulfillments.create", "ful-2", "different"),
			{ title: "Second" },
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("keeps one delivery per source record", async () => {
		const source = {
			sourceModule: "orders",
			sourceRecordId: "00000000-0000-4000-8000-0000000013cc",
		};
		await createFulfillmentCommand(context("fulfillments.create", "ful-3a"), {
			title: "From order",
			...source,
		});
		await expect(
			createFulfillmentCommand(context("fulfillments.create", "ful-3b"), {
				title: "Duplicate from same order",
				...source,
			}),
		).rejects.toThrow(/already has a delivery/);
	});

	it("enforces the delivery status machine", async () => {
		const created = await createFulfillmentCommand(
			context("fulfillments.create", "ful-4"),
			{ title: "Deliver" },
		);
		const id = idOf(created);

		await setFulfillmentStatusCommand(
			context("fulfillments.set-status", "ful-4-done"),
			id,
			"fulfilled",
		);
		await expect(
			setFulfillmentStatusCommand(
				context("fulfillments.set-status", "ful-4-again"),
				id,
				"fulfilled",
			),
		).rejects.toThrow(/already in that status/);
		await expect(
			setFulfillmentStatusCommand(
				context("fulfillments.set-status", "ful-4-reopen"),
				id,
				"in_progress",
			),
		).rejects.toThrow(/isn't allowed/);
	});

	it("separates a missing delivery from one that can no longer be deleted", async () => {
		const created = await createFulfillmentCommand(
			context("fulfillments.create", "ful-5"),
			{ title: "Deliver" },
		);
		const id = idOf(created);
		await setFulfillmentStatusCommand(
			context("fulfillments.set-status", "ful-5-progress"),
			id,
			"in_progress",
		);

		await expect(
			deleteFulfillmentCommand(context("fulfillments.delete", "ful-5-del"), id),
		).rejects.toThrow(/Only a pending delivery can be deleted/);

		await expect(
			deleteFulfillmentCommand(
				context("fulfillments.delete", "ful-5-missing"),
				"00000000-0000-4000-8000-0000000013ff",
			),
		).rejects.toThrow(/was not found/);
	});

	it("deletes a pending delivery", async () => {
		const created = await createFulfillmentCommand(
			context("fulfillments.create", "ful-6"),
			{ title: "Deliver" },
		);
		const deleted = await deleteFulfillmentCommand(
			context("fulfillments.delete", "ful-6-del"),
			idOf(created),
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});
});
