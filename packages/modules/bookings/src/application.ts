import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	bookings,
	db,
	eq,
	gt,
	gte,
	lte,
	mutationUnitOfWork,
} from "@quickengine/db";
import { z } from "zod";
import {
	BOOKING_STATUSES,
	type BookingInput,
	type BookingStatus,
} from "./booking";
import {
	createBookingInTx,
	deleteBookingInTx,
	setBookingStatusInTx,
	updateBookingInTx,
} from "./bookings";

export type BookingMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

export const bookingListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	scheduleKey: z.string().trim().min(1).max(200).optional(),
	status: z.enum(BOOKING_STATUSES).optional(),
	/** Inclusive window filters on the booking's start time. */
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this booking was not found.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",
	CATALOG_ITEM_NOT_FOUND: "The booked item was not found.",
	CATALOG_ITEM_WORKSPACE_MISMATCH:
		"That catalog item belongs to another workspace.",
	CATALOG_ITEM_NOT_BOOKABLE:
		"Only a service, rental, or package can be booked.",
	CATALOG_ITEM_VARIANT_NOT_FOUND: "The booked variant was not found.",
	CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH:
		"That variant belongs to another workspace.",
	CATALOG_ITEM_VARIANT_PARENT_MISMATCH:
		"That variant doesn't belong to the booked item.",
	BOOKING_NOT_FOUND: "The booking was not found.",
	BOOKING_NOT_EDITABLE: "Only a requested or confirmed booking can be changed.",
	BOOKING_SCHEDULE_CONFLICT:
		"That slot overlaps an existing booking on the same schedule.",
	BOOKING_STATUS_UNCHANGED: "The booking is already in that status.",
	BOOKING_ILLEGAL_TRANSITION: "That booking status change isn't allowed.",
	BOOKING_NOT_DELETABLE:
		"Only a requested or cancelled booking can be deleted.",
	BOOKING_CONCURRENT_UPDATE:
		"The booking changed while this update was in flight. Try again.",
};

function mapBookingError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/(MISMATCH|NOT_BOOKABLE)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_EDITABLE|SCHEDULE_CONFLICT|UNCHANGED|ILLEGAL_TRANSITION|NOT_DELETABLE|CONCURRENT_UPDATE)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeBooking = (row: typeof bookings.$inferSelect) =>
	serializeDates(row);

export type BookingDto = ReturnType<typeof serializeBooking>;

export async function listBookingsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		limit?: number | string;
		scheduleKey?: string;
		status?: string;
		from?: string | Date;
		to?: string | Date;
	},
) {
	const page = bookingListQuerySchema.parse(query);
	const where = and(
		eq(bookings.workspaceId, workspaceId),
		page.cursor ? gt(bookings.id, page.cursor) : undefined,
		page.scheduleKey ? eq(bookings.scheduleKey, page.scheduleKey) : undefined,
		page.status ? eq(bookings.status, page.status) : undefined,
		page.from ? gte(bookings.startsAt, page.from) : undefined,
		page.to ? lte(bookings.startsAt, page.to) : undefined,
	);
	const rows = await db
		.select()
		.from(bookings)
		.where(where)
		.orderBy(asc(bookings.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeBooking),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getBookingDto(workspaceId: string, id: string) {
	const [booking] = await db
		.select()
		.from(bookings)
		.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
		.limit(1);
	return booking ? serializeBooking(booking) : null;
}

export function createBookingCommand(
	context: MutationExecutionContext,
	input: BookingInput,
	uow: BookingMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<BookingDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createBookingInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "booking.created",
				metadata: { scheduleKey: row.scheduleKey },
				resourceId: row.id,
				resourceType: "booking",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "booking",
				eventName: "booking.created",
				payload: {
					bookingId: row.id,
					scheduleKey: row.scheduleKey,
					startsAt: row.startsAt.toISOString(),
				},
				version: 1,
			});
			return { result: serializeBooking(row), status: 201 };
		})
		.catch(mapBookingError);
}

export function updateBookingCommand(
	context: MutationExecutionContext,
	id: string,
	input: BookingInput,
	uow: BookingMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<BookingDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateBookingInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "booking.updated",
				resourceId: row.id,
				resourceType: "booking",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "booking",
				eventName: "booking.updated",
				payload: {
					bookingId: row.id,
					scheduleKey: row.scheduleKey,
					startsAt: row.startsAt.toISOString(),
				},
				version: 1,
			});
			return { result: serializeBooking(row), status: 200 };
		})
		.catch(mapBookingError);
}

export function setBookingStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: BookingStatus,
	options: { cancellationReason?: string | null } = {},
	uow: BookingMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<BookingDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setBookingStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
				options,
			);
			await transaction.audit({
				action: "booking.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "booking",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "booking",
				eventName: "booking.status-changed",
				payload: { bookingId: row.id, status },
				version: 1,
			});
			return { result: serializeBooking(row), status: 200 };
		})
		.catch(mapBookingError);
}

export function deleteBookingCommand(
	context: MutationExecutionContext,
	id: string,
	uow: BookingMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteBookingInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "booking.deleted",
				resourceId: row.id,
				resourceType: "booking",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "booking",
				eventName: "booking.deleted",
				payload: { bookingId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapBookingError);
}
