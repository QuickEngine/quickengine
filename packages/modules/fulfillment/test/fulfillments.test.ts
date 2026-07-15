import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createFulfillment,
	deleteFulfillment,
	getFulfillment,
	listFulfillments,
	setFulfillmentStatus,
} from "../src";

const ownerId = "fulfillment-owner";
const workspaceId = "00000000-0000-4000-8000-000000000901";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000902";
const clientId = "00000000-0000-4000-8000-000000000903";
const invoiceId = "00000000-0000-4000-8000-000000000904";
const unpaidInvoiceId = "00000000-0000-4000-8000-000000000905";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Fulfillment Owner', 'fulfillment@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Fulfillment', 'agency'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'agency')`;
	await sql`insert into client_records (id, workspace_id, name, email, company) values (${clientId}, ${workspaceId}, 'Delivery Client', 'delivery@example.com', 'Delivery Co')`;
	await sql`insert into invoices (id, workspace_id, client_id, client_name, client_email, client_company, number, status, currency, total_cents) values (${invoiceId}, ${workspaceId}, ${clientId}, 'Delivery Client', 'delivery@example.com', 'Delivery Co', 'INV-0001', 'paid', 'USD', 3000), (${unpaidInvoiceId}, ${workspaceId}, ${clientId}, 'Delivery Client', 'delivery@example.com', 'Delivery Co', 'INV-0002', 'sent', 'USD', 3000)`;
});

describe("Fulfillment persistence", () => {
	it("creates from a paid invoice and snapshots historical identity", async () => {
		const record = await createFulfillment(workspaceId, {
			title: "Deliver website",
			kind: "digital",
			invoiceId,
			sourceModule: "invoicing",
			sourceRecordId: invoiceId,
			instructions: "Send the final production URL",
		});
		expect(record).toMatchObject({
			clientName: "Delivery Client",
			clientEmail: "delivery@example.com",
			clientCompany: "Delivery Co",
			invoiceNumber: "INV-0001",
			status: "pending",
		});
	});

	it("requires a paid invoice and prevents duplicate source delivery", async () => {
		await expect(
			createFulfillment(workspaceId, {
				title: "Too early",
				invoiceId: unpaidInvoiceId,
			}),
		).rejects.toThrow("INVOICE_NOT_PAID");
		const input = {
			title: "Deliver website",
			invoiceId,
			sourceModule: "invoicing",
			sourceRecordId: invoiceId,
		} as const;
		await createFulfillment(workspaceId, input);
		await expect(createFulfillment(workspaceId, input)).rejects.toThrow(
			"FULFILLMENT_SOURCE_EXISTS",
		);
	});

	it("scopes reads, lifecycle changes, and deletion to the workspace", async () => {
		const record = await createFulfillment(workspaceId, {
			title: "Manual work",
		});
		expect(await getFulfillment(otherWorkspaceId, record.id)).toBeUndefined();
		await expect(
			setFulfillmentStatus(otherWorkspaceId, record.id, "in_progress"),
		).rejects.toThrow("FULFILLMENT_NOT_FOUND");
		expect(
			await deleteFulfillment(otherWorkspaceId, record.id),
		).toBeUndefined();
		expect(await listFulfillments(otherWorkspaceId)).toEqual([]);
	});

	it("locks terminal history and deletes only pending records", async () => {
		const pending = await createFulfillment(workspaceId, {
			title: "Delete me",
		});
		expect((await deleteFulfillment(workspaceId, pending.id))?.id).toBe(
			pending.id,
		);
		const completed = await createFulfillment(workspaceId, {
			title: "Complete me",
		});
		await setFulfillmentStatus(workspaceId, completed.id, "in_progress");
		await setFulfillmentStatus(workspaceId, completed.id, "fulfilled");
		expect(await deleteFulfillment(workspaceId, completed.id)).toBeUndefined();
		await expect(
			setFulfillmentStatus(workspaceId, completed.id, "cancelled"),
		).rejects.toThrow("FULFILLMENT_ILLEGAL_TRANSITION");
	});
});
