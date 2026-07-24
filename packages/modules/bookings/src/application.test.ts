import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createBookingCommand,
	deleteBookingCommand,
	setBookingStatusCommand,
	updateBookingCommand,
} from "./application";

const ownerId = "bookings-owner";
const workspaceId = "00000000-0000-4000-8000-0000000017a1";
const clientId = "00000000-0000-4000-8000-0000000017b1";

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

const at = (hour: number) =>
	new Date(`2026-08-01T${String(hour).padStart(2, "0")}:00:00.000Z`);

const bookingInput = (overrides: Record<string, unknown> = {}) => ({
	clientId,
	title: "Consultation",
	startsAt: at(10),
	endsAt: at(11),
	timeZone: "UTC",
	...overrides,
});

const idOf = (result: Awaited<ReturnType<typeof createBookingCommand>>) =>
	result.kind === "success" ? (result.result as { id: string }).id : "";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Bookings Owner', 'bookings@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Bookings Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name)
		values (${clientId}, ${workspaceId}, 'Booking Client')
	`;
});

describe("Bookings durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createBookingCommand(
			context("bookings.create", "bkg-1"),
			bookingInput(),
		);
		const replay = await createBookingCommand(
			context("bookings.create", "bkg-1"),
			bookingInput(),
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
				(select count(*)::int from bookings where workspace_id = ${workspaceId}) bookings,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			bookings: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("refuses a slot that overlaps a live booking on the same schedule", async () => {
		await createBookingCommand(
			context("bookings.create", "bkg-2"),
			bookingInput(),
		);

		await expect(
			createBookingCommand(
				context("bookings.create", "bkg-2-overlap"),
				// Starts inside the existing 10:00-11:00 slot.
				bookingInput({ startsAt: at(10), endsAt: at(12), title: "Clash" }),
			),
		).rejects.toThrow(/overlaps an existing booking/);
	});

	it("allows the same slot on a different schedule key", async () => {
		await createBookingCommand(
			context("bookings.create", "bkg-3"),
			bookingInput(),
		);

		const other = await createBookingCommand(
			context("bookings.create", "bkg-3-other"),
			bookingInput({ scheduleKey: "room-two", title: "Parallel" }),
		);
		expect(other).toMatchObject({ kind: "success", status: 201 });
	});

	it("frees the slot once a booking is cancelled", async () => {
		const id = idOf(
			await createBookingCommand(
				context("bookings.create", "bkg-4"),
				bookingInput(),
			),
		);
		await setBookingStatusCommand(
			context("bookings.set-status", "bkg-4-cancel"),
			id,
			"cancelled",
			{ cancellationReason: "Client rescheduled" },
		);

		// Cancelled bookings stop blocking, so the same slot can be rebooked.
		const rebooked = await createBookingCommand(
			context("bookings.create", "bkg-4-rebook"),
			bookingInput({ title: "Rebooked" }),
		);
		expect(rebooked).toMatchObject({ kind: "success", status: 201 });
	});

	it("enforces the booking status machine", async () => {
		const id = idOf(
			await createBookingCommand(
				context("bookings.create", "bkg-5"),
				bookingInput(),
			),
		);

		await expect(
			setBookingStatusCommand(
				context("bookings.set-status", "bkg-5-same"),
				id,
				"requested",
			),
		).rejects.toThrow(/already in that status/);

		await setBookingStatusCommand(
			context("bookings.set-status", "bkg-5-confirm"),
			id,
			"confirmed",
		);
		await expect(
			setBookingStatusCommand(
				context("bookings.set-status", "bkg-5-back"),
				id,
				"requested",
			),
		).rejects.toThrow(/isn't allowed/);
	});

	it("only edits a booking that hasn't been checked in", async () => {
		const id = idOf(
			await createBookingCommand(
				context("bookings.create", "bkg-6"),
				bookingInput(),
			),
		);
		await setBookingStatusCommand(
			context("bookings.set-status", "bkg-6-confirm"),
			id,
			"confirmed",
		);
		await setBookingStatusCommand(
			context("bookings.set-status", "bkg-6-checkin"),
			id,
			"checked_in",
		);

		await expect(
			updateBookingCommand(
				context("bookings.update", "bkg-6-edit"),
				id,
				bookingInput({ title: "Too late" }),
			),
		).rejects.toThrow(/requested or confirmed booking can be changed/);
	});

	it("deletes only a requested or cancelled booking", async () => {
		const confirmed = idOf(
			await createBookingCommand(
				context("bookings.create", "bkg-7"),
				bookingInput(),
			),
		);
		await setBookingStatusCommand(
			context("bookings.set-status", "bkg-7-confirm"),
			confirmed,
			"confirmed",
		);
		await expect(
			deleteBookingCommand(context("bookings.delete", "bkg-7-del"), confirmed),
		).rejects.toThrow(/requested or cancelled booking can be deleted/);

		const requested = idOf(
			await createBookingCommand(
				context("bookings.create", "bkg-8"),
				bookingInput({ scheduleKey: "room-three" }),
			),
		);
		const deleted = await deleteBookingCommand(
			context("bookings.delete", "bkg-8-del"),
			requested,
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});

	it("rolls the whole booking back when its client reference is invalid", async () => {
		await expect(
			createBookingCommand(
				context("bookings.create", "bkg-9"),
				bookingInput({ clientId: "00000000-0000-4000-8000-0000000017ff" }),
			),
		).rejects.toThrow(/client on this booking was not found/);

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from bookings where workspace_id = ${workspaceId}) bookings,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits
		`;
		expect(counts).toMatchObject({ bookings: 0, audits: 0 });
	});
});
