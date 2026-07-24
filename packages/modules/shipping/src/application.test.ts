import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createShipmentCommand,
	deleteShipmentCommand,
	setShipmentStatusCommand,
	updateShipmentTrackingCommand,
} from "./application";

const ownerId = "shipping-owner";
const workspaceId = "00000000-0000-4000-8000-0000000015a1";
const clientId = "00000000-0000-4000-8000-0000000015b1";
const orderId = "00000000-0000-4000-8000-0000000015c1";
const orderLineId = "00000000-0000-4000-8000-0000000015d1";

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

const destination = {
	recipientName: "Ada Lovelace",
	line1: "12 Analytical Way",
	city: "London",
	postalCode: "EC1A 1BB",
	countryCode: "GB",
};

const shipmentInput = (overrides: Record<string, unknown> = {}) => ({
	orderId,
	destination,
	lines: [{ orderLineItemId: orderLineId, quantity: 2 }],
	parcels: [{ weightGrams: 500 }],
	...overrides,
});

const idOf = (result: Awaited<ReturnType<typeof createShipmentCommand>>) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Shipping Owner', 'shipping@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Shipping Workspace', 'ecommerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name)
		values (${clientId}, ${workspaceId}, 'Shipping Client')
	`;
	await sql`
		insert into orders (
			id, workspace_id, client_id, client_name, sequence, number,
			status, subtotal_cents, total_cents
		)
		values (
			${orderId}, ${workspaceId}, ${clientId}, 'Shipping Client', 1, 'ORD-0001',
			'confirmed', 5000, 5000
		)
	`;
	await sql`
		insert into order_line_items (
			id, order_id, name, type, quantity, unit_price_cents, line_total_cents, position
		)
		values (
			${orderLineId}, ${orderId}, 'Business Cards', 'physical', 3, 2500, 7500, 0
		)
	`;
});

describe("Shipping durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createShipmentCommand(
			context("shipments.create", "shp-1"),
			shipmentInput(),
		);
		const replay = await createShipmentCommand(
			context("shipments.create", "shp-1"),
			shipmentInput(),
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
				(select count(*)::int from shipments where workspace_id = ${workspaceId}) shipments,
				(select count(*)::int from fulfillments where workspace_id = ${workspaceId}) fulfillments,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		// One shipment opens exactly one delivery record — the replay must not open a second.
		expect(counts).toMatchObject({
			shipments: 1,
			fulfillments: 1,
			mutations: 1,
			audits: 1,
		});
	});

	it("refuses to ship more units than the order has", async () => {
		await expect(
			createShipmentCommand(
				context("shipments.create", "shp-2"),
				shipmentInput({
					lines: [{ orderLineItemId: orderLineId, quantity: 99 }],
				}),
			),
		).rejects.toThrow(/more units than the order has remaining/);
	});

	it("moves the delivery record along with the shipment", async () => {
		const created = await createShipmentCommand(
			context("shipments.create", "shp-3"),
			shipmentInput(),
		);
		const id = idOf(created);
		await setShipmentStatusCommand(
			context("shipments.set-status", "shp-3-ready"),
			id,
			"ready",
		);
		await setShipmentStatusCommand(
			context("shipments.set-status", "shp-3-shipped"),
			id,
			"shipped",
		);
		await setShipmentStatusCommand(
			context("shipments.set-status", "shp-3-delivered"),
			id,
			"delivered",
		);

		const sql = testDbClient();
		const [delivery] = await sql`
			select f.status
			from fulfillments f
			join shipments s on s.fulfillment_id = f.id
			where s.id = ${id}
		`;
		expect(delivery).toMatchObject({ status: "fulfilled" });
	});

	it("locks tracking once a shipment is delivered", async () => {
		const created = await createShipmentCommand(
			context("shipments.create", "shp-4"),
			shipmentInput(),
		);
		const id = idOf(created);
		for (const [suffix, status] of [
			["ready", "ready"],
			["shipped", "shipped"],
			["delivered", "delivered"],
		] as const) {
			await setShipmentStatusCommand(
				context("shipments.set-status", `shp-4-${suffix}`),
				id,
				status,
			);
		}

		await expect(
			updateShipmentTrackingCommand(
				context("shipments.tracking", "shp-4-track"),
				id,
				{ trackingNumber: "TOO-LATE" },
			),
		).rejects.toThrow(/can't be changed once a shipment is delivered/);
	});

	it("requires tracking before shipping when the workspace demands it", async () => {
		const created = await createShipmentCommand(
			context("shipments.create", "shp-5"),
			shipmentInput(),
		);
		const id = idOf(created);
		await setShipmentStatusCommand(
			context("shipments.set-status", "shp-5-ready"),
			id,
			"ready",
		);

		await expect(
			setShipmentStatusCommand(
				context("shipments.set-status", "shp-5-shipped"),
				id,
				"shipped",
				{ requireTracking: true },
			),
		).rejects.toThrow(/Add a tracking number/);
	});

	it("deletes a draft shipment", async () => {
		const created = await createShipmentCommand(
			context("shipments.create", "shp-6"),
			shipmentInput(),
		);
		const deleted = await deleteShipmentCommand(
			context("shipments.delete", "shp-6-del"),
			idOf(created),
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});
});
