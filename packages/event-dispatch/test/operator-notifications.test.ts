import { apiOutboxEvents, db, eq, notifications } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { drainOutbox } from "@quickengine/events";
import { beforeEach, describe, expect, it } from "vitest";
import { operatorNotificationHandler } from "../src";

/**
 * The bell, against a real database.
 *
 * ⚠️ Real rows, real drain, real unique constraint. The whole point of this
 * handler is what happens on REDELIVERY, and that is enforced by a database
 * constraint — a mocked insert would prove nothing about the thing most likely
 * to break.
 */

const ownerId = "operator-notify-owner";
const secondId = "operator-notify-second";
const organizationId = "00000000-0000-4000-8000-0000000c0001";
const workspaceId = "00000000-0000-4000-8000-0000000c0002";
const soloWorkspaceId = "00000000-0000-4000-8000-0000000c0003";
const catalogItemId = "00000000-0000-4000-8000-0000000c0004";
const inventoryItemId = "00000000-0000-4000-8000-0000000c0005";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values
			(${ownerId}, 'Shop Owner', 'owner@example.com', true),
			(${secondId}, 'Shop Manager', 'manager@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, owner_id)
		values (${organizationId}, 'Coffee Co', 'coffee-co', ${ownerId})
	`;
	await sql`
		insert into quickengine_organization_members (organization_id, user_id, role)
		values
			(${organizationId}, ${ownerId}, 'owner'),
			(${organizationId}, ${secondId}, 'admin')
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, slug, business_type)
		values (${workspaceId}, ${ownerId}, ${organizationId}, 'Coffee Shop', 'coffee-shop', 'ecommerce')
	`;
	// No organization, so nobody to tell. Personal workspaces are real.
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${soloWorkspaceId}, ${ownerId}, 'Solo', 'ecommerce')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type)
		values (${catalogItemId}, ${workspaceId}, 'Ethiopia Guji', 'product')
	`;
	await sql`
		insert into inventory_items (id, workspace_id, catalog_item_id, on_hand, low_stock_threshold)
		values (${inventoryItemId}, ${workspaceId}, ${catalogItemId}, 2, 5)
	`;
});

async function emit(
	eventName: string,
	payload: Record<string, unknown> = {},
	overrides: Record<string, unknown> = {},
) {
	const [row] = await db
		.insert(apiOutboxEvents)
		.values({
			aggregateId: crypto.randomUUID(),
			aggregateType: "test",
			eventName,
			payload,
			requestId: crypto.randomUUID(),
			version: 1,
			workspaceId,
			...overrides,
		})
		.returning();
	return row;
}

const drain = () => drainOutbox({ handlers: [operatorNotificationHandler()] });

const inbox = () => db.select().from(notifications);

describe("operator notifications", () => {
	it("tells every member of the organization about a paid order", async () => {
		await emit("order.paid", { totalCents: 4820 });
		await drain();

		const rows = await inbox();
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.userId).sort()).toEqual(
			[ownerId, secondId].sort(),
		);
		// 🔴 `attention`, not `news`: a paid order reaches an inbox, because
		// money has changed hands and somebody is now owed a parcel.
		expect(rows[0].signal).toBe("attention");
		// Slug, not uuid — the link has to read as the business.
		expect(rows[0].href).toBe("/coffee-shop/orders");
	});

	it("writes one notification per person no matter how often the event is delivered", async () => {
		const event = await emit("order.paid", { totalCents: 4820 });
		await drain();

		// Exactly what an at-least-once redelivery looks like.
		await db
			.update(apiOutboxEvents)
			.set({ publishedAt: null, availableAt: new Date(), attempts: 0 })
			.where(eq(apiOutboxEvents.id, event.id));
		const second = await drain();

		expect(second.claimed).toBe(1);
		expect(second.published).toBe(1);
		expect(await inbox()).toHaveLength(2);
	});

	it("carries its signals, and stays quiet about everything else", async () => {
		await emit("order.paid", {});
		// `news` still exists as a level; nothing in this set currently uses it,
		// which is the point — routine progress does not interrupt anybody.
		await emit("customer.message.received", { conversationId: null });
		await emit("payment.status-changed", { status: "disputed" });
		await emit("shipment.status-changed", { status: "exception" });
		// Ordinary bookkeeping. The activity feed has it; the bell should not.
		await emit("catalog-item.updated", {});
		await emit("payment.status-changed", { status: "succeeded" });
		// 🔴 A declined card is normal shop traffic — the customer retries in
		// seconds. Notifying on it buries the dispute above.
		await emit("payment.status-changed", { status: "failed" });
		await drain();

		const rows = await inbox();
		const signals = new Set(rows.map((row) => row.signal));
		expect(signals).toEqual(new Set(["attention", "failure"]));
		// Four qualifying events, two members.
		expect(rows).toHaveLength(8);
	});

	it("warns when an adjustment leaves an item at or below its threshold", async () => {
		await emit("inventory-item.adjusted", {
			inventoryItemId,
			resultingOnHand: 2,
		});
		await drain();

		const rows = await inbox();
		expect(rows).toHaveLength(2);
		expect(rows[0].signal).toBe("attention");
		expect(rows[0].title).toContain("Ethiopia Guji");
	});

	it("warns once a day per item, not once per sale", async () => {
		await emit("inventory-item.adjusted", {
			inventoryItemId,
			resultingOnHand: 2,
		});
		await drain();
		// A second sale of the same low item, minutes later. Same fact.
		await emit("inventory-item.adjusted", {
			inventoryItemId,
			resultingOnHand: 1,
		});
		await drain();

		expect(await inbox()).toHaveLength(2);
	});

	it("says nothing about stock that is above its threshold", async () => {
		await emit("inventory-item.adjusted", {
			inventoryItemId,
			resultingOnHand: 40,
		});
		await drain();

		expect(await inbox()).toHaveLength(0);
	});

	it("has nobody to tell in a workspace with no organization", async () => {
		await emit("order.paid", {}, { workspaceId: soloWorkspaceId });
		const result = await drain();

		// Delivered successfully — there was simply no one to notify. A workspace
		// without an organization must not wedge the outbox behind a retry.
		expect(result.published).toBe(1);
		expect(await inbox()).toHaveLength(0);
	});
});
