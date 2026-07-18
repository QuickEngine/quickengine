import { testDbClient } from "@quickengine/db/testing";
import { createInvoice, getInvoice } from "@quickengine/mod-invoicing";
import { createProject } from "@quickengine/mod-projects-tasks";
import {
	approveTimeEntry,
	createManualTimeEntry,
	detachTimeEntriesFromDraftInvoice,
	getTimeEntry,
	invoiceApprovedTimeEntries,
} from "@quickengine/mod-time-tracking";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "tt-owner";
const workspaceId = "00000000-0000-4000-8000-0000000e0001";
const clientId = "00000000-0000-4000-8000-0000000e0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'TT Owner', 'tt@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'TT Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
});

async function approvedBillableEntry() {
	const project = await createProject(workspaceId, {
		name: "Retainer",
		clientId,
		status: "active",
	});
	const entry = await createManualTimeEntry(workspaceId, {
		projectId: project.id,
		workDate: "2026-07-14",
		durationSeconds: 3_600,
		billable: true,
		hourlyRateCents: 10_000,
		currency: "USD",
	});
	return approveTimeEntry(workspaceId, entry.id);
}

describe("Time Tracking → Invoicing bridge", () => {
	it("bills approved time into a draft invoice exactly once, and detach reverses it", async () => {
		const entry = await approvedBillableEntry();
		expect(entry.status).toBe("approved");
		expect(entry.amountCents).not.toBeNull();
		const amount = entry.amountCents ?? 0;

		const invoice = await createInvoice(workspaceId, {
			clientId,
			currency: "USD",
			lineItems: [
				{ description: "Deposit", quantity: 1, unitPriceCents: 5_000 },
			],
		});
		const beforeTotal =
			(await getInvoice(workspaceId, invoice.id))?.totalCents ?? 0;

		// Bill the approved entry into the draft invoice.
		await invoiceApprovedTimeEntries(workspaceId, invoice.id, [entry.id]);
		expect((await getTimeEntry(workspaceId, entry.id))?.status).toBe(
			"invoiced",
		);
		const afterBill = await getInvoice(workspaceId, invoice.id);
		expect(afterBill?.totalCents).toBe(beforeTotal + amount);
		expect(
			afterBill?.lineItems.some(
				(line) => line.sourceModule === "time-tracking",
			),
		).toBe(true);

		// Double-billing the same entry is rejected.
		await expect(
			invoiceApprovedTimeEntries(workspaceId, invoice.id, [entry.id]),
		).rejects.toThrow("TIME_ENTRY_ALREADY_INVOICED");

		// Detaching restores the entry to approved, removes the time line, and
		// recalculates the invoice total back down.
		await detachTimeEntriesFromDraftInvoice(workspaceId, invoice.id, [
			entry.id,
		]);
		expect((await getTimeEntry(workspaceId, entry.id))?.status).toBe(
			"approved",
		);
		const afterDetach = await getInvoice(workspaceId, invoice.id);
		expect(afterDetach?.totalCents).toBe(beforeTotal);
		expect(
			afterDetach?.lineItems.some(
				(line) => line.sourceModule === "time-tracking",
			),
		).toBe(false);
	});
});
