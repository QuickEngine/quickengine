import type { MutationResult } from "@quickengine/api-contracts/mutations";
import { testDbClient } from "@quickengine/db/testing";
import {
	convertBookingToInvoiceCommand,
	createBooking,
	setBookingStatus,
} from "@quickengine/mod-bookings";
import { getInvoice } from "@quickengine/mod-invoicing";
import { createCatalogItem } from "@quickengine/mod-products-services";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "b2i-owner";
const workspaceId = "00000000-0000-4000-8000-0000000b0001";
const clientId = "00000000-0000-4000-8000-0000000b0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'B2I Owner', 'b2i@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'B2I Workspace', 'service')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
	// Billing a booking requires the invoicing module enabled.
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'invoicing', true)
	`;
});

/**
 * Narrows a command outcome to its success case, failing loudly otherwise.
 *
 * `MutationResult` is a union — a conflict or an in-progress replay carries no
 * result at all — so a test that reached for `.result` directly would be
 * asserting on a shape the type says may not exist.
 */
function committed<T>(outcome: MutationResult<T>): {
	result: T;
	status: number;
} {
	if (outcome.kind !== "success") {
		throw new Error(`expected a committed mutation, got ${outcome.kind}`);
	}
	return { result: outcome.result, status: outcome.status };
}

/** Conversion is a durable command, so it needs an execution context. */
const context = (key: string) => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint: key,
	idempotencyKey: key,
	operation: "bookings.convert-to-invoice",
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

async function completedBooking(priceCents: number) {
	const service = await createCatalogItem(workspaceId, {
		name: "Ninety minute consultation",
		type: "service",
		status: "active",
		priceCents,
		currency: "USD",
	});
	const booking = await createBooking(workspaceId, {
		clientId,
		catalogItemId: service.id,
		title: "Consultation with Ada",
		startsAt: new Date("2026-07-20T10:00:00Z"),
		endsAt: new Date("2026-07-20T11:30:00Z"),
		timeZone: "UTC",
	});
	await setBookingStatus(workspaceId, booking.id, "confirmed");
	await setBookingStatus(workspaceId, booking.id, "checked_in");
	await setBookingStatus(workspaceId, booking.id, "completed");
	return { booking, service };
}

describe("Bookings → Invoicing bridge", () => {
	it("raises one draft invoice from a completed booking", async () => {
		const { booking, service } = await completedBooking(15_000);

		const result = committed(
			await convertBookingToInvoiceCommand(context("convert-1"), booking.id),
		);
		expect(result.status).toBe(201);

		const invoice = await getInvoice(workspaceId, result.result.invoiceId);
		// Draft, never issued: completing an appointment must not silently send a bill.
		expect(invoice?.status).toBe("draft");
		expect(invoice?.totalCents).toBe(15_000);
		expect(invoice?.clientId).toBe(clientId);

		// The line records where it came from, which is also what makes the
		// conversion idempotent.
		const [line] = invoice?.lineItems ?? [];
		expect(line?.sourceModule).toBe("bookings");
		expect(line?.sourceRecordId).toBe(booking.id);
		expect(line?.description).toBe(service.name);
	});

	// 🔴 The guarantee that matters. A dropped connection and a retry must not
	// bill a customer twice, and that caller has no idempotency key to offer.
	it("returns the same invoice on retry instead of billing twice", async () => {
		const { booking } = await completedBooking(15_000);

		const first = committed(
			await convertBookingToInvoiceCommand(context("convert-a"), booking.id),
		);
		const second = committed(
			// A DIFFERENT idempotency key: this proves the guard is the booking link
			// itself, not the platform's idempotency layer.
			await convertBookingToInvoiceCommand(context("convert-b"), booking.id),
		);

		expect(second.result.invoiceId).toBe(first.result.invoiceId);
		// 200, not 201 — a retry did not create a second resource.
		expect(second.status).toBe(200);

		const sql = testDbClient();
		const [{ count }] = await sql`
			select count(*)::int as count from invoices where workspace_id = ${workspaceId}
		`;
		expect(count).toBe(1);
	});

	// Price is snapshot, not referenced: editing the service later must not
	// rewrite a bill that was already raised.
	it("keeps the agreed price when the service is repriced afterwards", async () => {
		const { booking, service } = await completedBooking(15_000);
		const result = committed(
			await convertBookingToInvoiceCommand(context("convert-2"), booking.id),
		);

		const sql = testDbClient();
		await sql`
			update catalog_items set price_cents = 99_000 where id = ${service.id}
		`;

		const invoice = await getInvoice(workspaceId, result.result.invoiceId);
		expect(invoice?.totalCents).toBe(15_000);
	});

	it("refuses to bill a booking that never happened", async () => {
		const service = await createCatalogItem(workspaceId, {
			name: "Consultation",
			type: "service",
			status: "active",
			priceCents: 15_000,
			currency: "USD",
		});
		const booking = await createBooking(workspaceId, {
			clientId,
			catalogItemId: service.id,
			title: "Consultation with Ada",
			startsAt: new Date("2026-07-21T10:00:00Z"),
			endsAt: new Date("2026-07-21T11:00:00Z"),
			timeZone: "UTC",
		});
		await setBookingStatus(workspaceId, booking.id, "cancelled");

		await expect(
			convertBookingToInvoiceCommand(context("convert-3"), booking.id),
		).rejects.toThrow();
	});
});
