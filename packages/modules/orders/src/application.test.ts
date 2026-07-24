import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createOrderCommand,
	deleteOrderCommand,
	ensureOrderFulfillmentCommand,
	setOrderStatusCommand,
} from "./application";

const ownerId = "orders-owner";
const workspaceId = "00000000-0000-4000-8000-0000000012a1";
const clientId = "00000000-0000-4000-8000-0000000012b1";

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

const orderInput = (overrides: Record<string, unknown> = {}) => ({
	clientId,
	lines: [
		{
			name: "Business Cards",
			type: "physical" as const,
			quantity: 2,
			unitPriceCents: 2_500,
		},
	],
	...overrides,
});

const idOf = (result: Awaited<ReturnType<typeof createOrderCommand>>) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

async function placedOrder(key: string) {
	const created = await createOrderCommand(
		context("orders.create", `${key}-create`),
		orderInput(),
	);
	const id = idOf(created);
	await setOrderStatusCommand(
		context("orders.set-status", `${key}-placed`),
		id,
		"placed",
	);
	return id;
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Orders Owner', 'orders@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Orders Workspace', 'ecommerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ordering Client', 'client@example.com')
	`;
});

describe("Orders durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createOrderCommand(
			context("orders.create", "ord-1"),
			orderInput(),
		);
		const replay = await createOrderCommand(
			context("orders.create", "ord-1"),
			orderInput(),
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
				(select count(*)::int from orders where workspace_id = ${workspaceId}) orders,
				(select count(*)::int from order_line_items) lines,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			orders: 1,
			lines: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createOrderCommand(context("orders.create", "ord-2"), orderInput());
		const conflict = await createOrderCommand(
			context("orders.create", "ord-2", "different"),
			orderInput({ notes: "Rush" }),
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("rolls back the whole order when a referenced client is missing", async () => {
		await expect(
			createOrderCommand(
				context("orders.create", "ord-3"),
				orderInput({ clientId: "00000000-0000-4000-8000-00000000dead" }),
			),
		).rejects.toThrow(/client on this order was not found/);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from orders where workspace_id = ${workspaceId}) orders,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		expect(counts).toMatchObject({ orders: 0, audits: 0 });
	});

	it("enforces the order status machine", async () => {
		const id = await placedOrder("ord-4");
		await expect(
			setOrderStatusCommand(
				context("orders.set-status", "ord-4-illegal"),
				id,
				"fulfilled",
			),
		).rejects.toThrow(/isn't allowed/);
		await expect(
			setOrderStatusCommand(
				context("orders.set-status", "ord-4-same"),
				id,
				"placed",
			),
		).rejects.toThrow(/already in that status/);
	});

	it("opens fulfillment only once a confirmed order is ready", async () => {
		const id = await placedOrder("ord-5");
		await expect(
			ensureOrderFulfillmentCommand(
				context("orders.fulfillment", "ord-5-early"),
				id,
			),
		).rejects.toThrow(/confirmed or processing/);

		await setOrderStatusCommand(
			context("orders.set-status", "ord-5-confirmed"),
			id,
			"confirmed",
		);
		const opened = await ensureOrderFulfillmentCommand(
			context("orders.fulfillment", "ord-5-open"),
			id,
		);
		expect(opened).toMatchObject({ kind: "success", status: 200 });

		// The order can't complete while its fulfillment is still open.
		await setOrderStatusCommand(
			context("orders.set-status", "ord-5-processing"),
			id,
			"processing",
		);
		await expect(
			setOrderStatusCommand(
				context("orders.set-status", "ord-5-fulfilled"),
				id,
				"fulfilled",
			),
		).rejects.toThrow(/until its fulfillment is complete/);
	});

	it("deletes only a draft order", async () => {
		const draft = await createOrderCommand(
			context("orders.create", "ord-6"),
			orderInput(),
		);
		const draftId = idOf(draft);
		const placedId = await placedOrder("ord-7");

		await expect(
			deleteOrderCommand(context("orders.delete", "ord-7-delete"), placedId),
		).rejects.toThrow(/Only a draft order can be deleted/);

		const deleted = await deleteOrderCommand(
			context("orders.delete", "ord-6-delete"),
			draftId,
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});
});
