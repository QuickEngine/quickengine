import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	applyInventoryAdjustmentCommand,
	createInventoryItemCommand,
	deleteInventoryItemCommand,
	setInventoryItemStatusCommand,
} from "./application";

const ownerId = "inventory-owner";
const workspaceId = "00000000-0000-4000-8000-0000000014a1";
const catalogItemId = "00000000-0000-4000-8000-0000000014b1";

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

const idOf = (
	result: Awaited<ReturnType<typeof createInventoryItemCommand>>,
) => (result.kind === "success" ? (result.result as { id: string }).id : "");

async function trackedItem(key: string) {
	const created = await createInventoryItemCommand(
		context("inventory.create", key),
		{ catalogItemId },
	);
	return idOf(created);
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Inventory Owner', 'inventory@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Inventory Workspace', 'ecommerce')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status)
		values (${catalogItemId}, ${workspaceId}, 'Business Cards', 'physical', 'active')
	`;
});

describe("Inventory durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createInventoryItemCommand(
			context("inventory.create", "inv-1"),
			{ catalogItemId },
		);
		const replay = await createInventoryItemCommand(
			context("inventory.create", "inv-1"),
			{ catalogItemId },
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
				(select count(*)::int from inventory_items where workspace_id = ${workspaceId}) items,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			items: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a catalog item from another workspace", async () => {
		await expect(
			createInventoryItemCommand(context("inventory.create", "inv-2"), {
				catalogItemId: "00000000-0000-4000-8000-0000000014ff",
			}),
		).rejects.toThrow(/catalog item being tracked was not found/);
	});

	it("moves stock and records the resulting balance", async () => {
		const id = await trackedItem("inv-3");

		const received = await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-3-receive"),
			id,
			{ kind: "receive", quantity: 10 },
		);
		expect(received).toMatchObject({ kind: "success", status: 201 });

		const sql = testDbClient();
		const [item] = await sql`
			select on_hand, reserved from inventory_items where id = ${id}
		`;
		expect(item).toMatchObject({ on_hand: 10, reserved: 0 });
	});

	it("refuses a movement that would oversell available stock", async () => {
		const id = await trackedItem("inv-4");
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-4-receive"),
			id,
			{ kind: "receive", quantity: 2 },
		);

		await expect(
			applyInventoryAdjustmentCommand(
				context("inventory.adjust", "inv-4-oversell"),
				id,
				{ kind: "sale", quantity: 5 },
			),
		).rejects.toThrow(/isn't enough available stock/);
	});

	it("refuses to release more than is reserved", async () => {
		const id = await trackedItem("inv-5");
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-5-receive"),
			id,
			{ kind: "receive", quantity: 5 },
		);

		await expect(
			applyInventoryAdjustmentCommand(
				context("inventory.adjust", "inv-5-release"),
				id,
				{ kind: "release", quantity: 1 },
			),
		).rejects.toThrow(/aren't that many reserved units/);
	});

	it("keeps reserved units from being archived away", async () => {
		const id = await trackedItem("inv-6");
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-6-receive"),
			id,
			{ kind: "receive", quantity: 4 },
		);
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-6-reserve"),
			id,
			{ kind: "reserve", quantity: 2 },
		);

		await expect(
			setInventoryItemStatusCommand(
				context("inventory.set-status", "inv-6-archive"),
				id,
				"archived",
			),
		).rejects.toThrow(/still has reserved units/);
	});

	it("keeps movement history from being deleted away", async () => {
		const id = await trackedItem("inv-7");
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-7-receive"),
			id,
			{ kind: "receive", quantity: 1 },
		);
		await applyInventoryAdjustmentCommand(
			context("inventory.adjust", "inv-7-correct"),
			id,
			{ kind: "correction_out", quantity: 1 },
		);
		await setInventoryItemStatusCommand(
			context("inventory.set-status", "inv-7-archive"),
			id,
			"archived",
		);

		await expect(
			deleteInventoryItemCommand(context("inventory.delete", "inv-7-del"), id),
		).rejects.toThrow(/has movement history/);
	});

	it("deletes an archived record that never moved", async () => {
		const id = await trackedItem("inv-8");
		await setInventoryItemStatusCommand(
			context("inventory.set-status", "inv-8-archive"),
			id,
			"archived",
		);

		const deleted = await deleteInventoryItemCommand(
			context("inventory.delete", "inv-8-del"),
			id,
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});
});
