import {
	and,
	bookings,
	catalogItems,
	catalogItemVariants,
	clientRecords,
	db,
	desc,
	eq,
	gt,
	inArray,
	lt,
	ne,
	quickengineWorkspaces,
} from "@quickengine/db";
import {
	type BookingInput,
	type BookingStatus,
	bookingInputSchema,
	canTransitionBooking,
} from "./booking";

const BLOCKING_STATUSES = ["requested", "confirmed", "checked_in"] as const;
const BOOKABLE_CATALOG_TYPES = new Set(["service", "rental", "package"]);

async function assertReferences(
	executor: Pick<typeof db, "select">,
	workspaceId: string,
	input: ReturnType<typeof bookingInputSchema.parse>,
) {
	const [client] = await executor
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, input.clientId))
		.limit(1);
	if (!client) throw new Error("CLIENT_NOT_FOUND");
	if (client.workspaceId !== workspaceId) {
		throw new Error("CLIENT_WORKSPACE_MISMATCH");
	}

	if (!input.catalogItemId) return client;
	const [item] = await executor
		.select({
			workspaceId: catalogItems.workspaceId,
			type: catalogItems.type,
		})
		.from(catalogItems)
		.where(eq(catalogItems.id, input.catalogItemId))
		.limit(1);
	if (!item) throw new Error("CATALOG_ITEM_NOT_FOUND");
	if (item.workspaceId !== workspaceId) {
		throw new Error("CATALOG_ITEM_WORKSPACE_MISMATCH");
	}
	if (!BOOKABLE_CATALOG_TYPES.has(item.type)) {
		throw new Error("CATALOG_ITEM_NOT_BOOKABLE");
	}
	if (!input.catalogItemVariantId) return client;
	const [variant] = await executor
		.select({
			workspaceId: catalogItemVariants.workspaceId,
			catalogItemId: catalogItemVariants.catalogItemId,
		})
		.from(catalogItemVariants)
		.where(eq(catalogItemVariants.id, input.catalogItemVariantId))
		.limit(1);
	if (!variant) throw new Error("CATALOG_ITEM_VARIANT_NOT_FOUND");
	if (variant.workspaceId !== workspaceId) {
		throw new Error("CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH");
	}
	if (variant.catalogItemId !== input.catalogItemId) {
		throw new Error("CATALOG_ITEM_VARIANT_PARENT_MISMATCH");
	}
	return client;
}

async function assertNoOverlap(
	executor: Pick<typeof db, "select">,
	workspaceId: string,
	input: ReturnType<typeof bookingInputSchema.parse>,
	excludeId?: string,
) {
	const conditions = [
		eq(bookings.workspaceId, workspaceId),
		eq(bookings.scheduleKey, input.scheduleKey),
		inArray(bookings.status, [...BLOCKING_STATUSES]),
		lt(bookings.startsAt, input.endsAt),
		gt(bookings.endsAt, input.startsAt),
	];
	if (excludeId) conditions.push(ne(bookings.id, excludeId));
	const [conflict] = await executor
		.select({ id: bookings.id })
		.from(bookings)
		.where(and(...conditions))
		.limit(1);
	if (conflict) throw new Error("BOOKING_SCHEDULE_CONFLICT");
}

export async function createBooking(workspaceId: string, input: BookingInput) {
	const parsed = bookingInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
		const client = await assertReferences(tx, workspaceId, parsed);
		await assertNoOverlap(tx, workspaceId, parsed);
		const [created] = await tx
			.insert(bookings)
			.values({
				workspaceId,
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				catalogItemId: parsed.catalogItemId,
				catalogItemVariantId: parsed.catalogItemVariantId,
				title: parsed.title,
				scheduleKey: parsed.scheduleKey,
				startsAt: parsed.startsAt,
				endsAt: parsed.endsAt,
				timeZone: parsed.timeZone,
				locationKind: parsed.locationKind,
				location: parsed.location,
				notes: parsed.notes,
				metadata: parsed.metadata,
			})
			.returning();
		return created;
	});
}

export async function listBookings(workspaceId: string) {
	return db
		.select()
		.from(bookings)
		.where(eq(bookings.workspaceId, workspaceId))
		.orderBy(desc(bookings.startsAt), desc(bookings.id));
}

export async function getBooking(workspaceId: string, id: string) {
	const [booking] = await db
		.select()
		.from(bookings)
		.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
		.limit(1);
	return booking;
}

export async function updateBooking(
	workspaceId: string,
	id: string,
	input: BookingInput,
) {
	const parsed = bookingInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
		const [current] = await tx
			.select({ status: bookings.status })
			.from(bookings)
			.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("BOOKING_NOT_FOUND");
		if (current.status !== "requested" && current.status !== "confirmed") {
			throw new Error("BOOKING_NOT_EDITABLE");
		}
		const client = await assertReferences(tx, workspaceId, parsed);
		await assertNoOverlap(tx, workspaceId, parsed, id);
		const [updated] = await tx
			.update(bookings)
			.set({
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				catalogItemId: parsed.catalogItemId,
				catalogItemVariantId: parsed.catalogItemVariantId,
				title: parsed.title,
				scheduleKey: parsed.scheduleKey,
				startsAt: parsed.startsAt,
				endsAt: parsed.endsAt,
				timeZone: parsed.timeZone,
				locationKind: parsed.locationKind,
				location: parsed.location,
				notes: parsed.notes,
				metadata: parsed.metadata,
				updatedAt: new Date(),
			})
			.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
			.returning();
		return updated;
	});
}

export async function setBookingStatus(
	workspaceId: string,
	id: string,
	status: BookingStatus,
	options: { cancellationReason?: string | null } = {},
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: bookings.status })
			.from(bookings)
			.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("BOOKING_NOT_FOUND");
		if (current.status === status) throw new Error("BOOKING_STATUS_UNCHANGED");
		if (!canTransitionBooking(current.status, status)) {
			throw new Error("BOOKING_ILLEGAL_TRANSITION");
		}
		const now = new Date();
		const timestamps = {
			requested: {},
			confirmed: { confirmedAt: now },
			checked_in: { checkedInAt: now },
			completed: { completedAt: now },
			cancelled: {
				cancelledAt: now,
				cancellationReason: options.cancellationReason?.trim() || null,
			},
			no_show: { noShowAt: now },
		}[status];
		const [updated] = await tx
			.update(bookings)
			.set({ status, ...timestamps, updatedAt: now })
			.where(
				and(
					eq(bookings.workspaceId, workspaceId),
					eq(bookings.id, id),
					eq(bookings.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("BOOKING_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function deleteBooking(workspaceId: string, id: string) {
	const current = await getBooking(workspaceId, id);
	if (!current) throw new Error("BOOKING_NOT_FOUND");
	if (current.status !== "requested" && current.status !== "cancelled") {
		throw new Error("BOOKING_NOT_DELETABLE");
	}
	const [deleted] = await db
		.delete(bookings)
		.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
		.returning();
	return deleted;
}
