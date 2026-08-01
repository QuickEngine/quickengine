import {
	and,
	bookings,
	catalogItems,
	type db,
	eq,
	invoiceLineItems,
	invoices,
	quickengineWorkspaces,
	workspaceModules,
} from "@quickengine/db";
import {
	allocateInvoiceSequence,
	formatInvoiceNumber,
} from "@quickengine/mod-invoicing";

type BookingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The module id recorded on the invoice line, so the link is queryable both ways. */
export const BOOKING_SOURCE_MODULE = "bookings";

/**
 * Only a finished appointment becomes a bill.
 *
 * A `requested` or `confirmed` booking has not happened yet, and a `cancelled`
 * or `no_show` one produced nothing to charge for. Invoicing either would be
 * charging a customer for work that was not done, which Hard rule 7's spirit and
 * plain fairness both forbid.
 */
export const canConvertBooking = (status: string): boolean =>
	status === "completed";

async function assertModuleEnabled(
	tx: BookingTransaction,
	workspaceId: string,
	moduleId: string,
) {
	const [enabled] = await tx
		.select({ id: workspaceModules.id })
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.moduleId, moduleId),
				eq(workspaceModules.enabled, true),
			),
		)
		.limit(1);
	if (!enabled) throw new Error("MODULE_DISABLED");
}

/**
 * Turn a completed booking into a draft invoice.
 *
 * **Idempotent by lookup, not only by key.** Before creating anything it asks
 * whether an invoice line already points at this booking. A retried request, a
 * double-click, or a replayed job therefore returns the invoice that already
 * exists rather than billing the customer twice — and it holds even when the
 * caller supplies no idempotency key at all, which is the case this has to
 * survive. `invoice_line_items.sourceModule` / `sourceRecordId` already existed
 * for exactly this kind of link, so nothing new is stored.
 *
 * **The price and description are SNAPSHOT, never referenced.** A catalog item's
 * price today is not necessarily what was agreed when the appointment was
 * booked. Pointing the line at the live service would silently rewrite an
 * already-issued bill the next time somebody edits their pricing — a customer
 * disputing an invoice would be right, and we would have no record of what was
 * actually agreed.
 *
 * **Draft, not issued.** Completing an appointment must not silently send
 * somebody a bill. An operator who marked the wrong booking complete needs a way
 * back, and a draft gives them one. This matches quote conversion, which also
 * produces a draft.
 */
export async function convertBookingToInvoiceInTx(
	tx: BookingTransaction,
	workspaceId: string,
	id: string,
	options: { numberPrefix?: string; now?: Date } = {},
) {
	const numberPrefix = options.numberPrefix ?? "INV";
	const now = options.now ?? new Date();

	// Lock the booking: two concurrent completions must not both allocate an
	// invoice number for the same appointment.
	const [booking] = await tx
		.select()
		.from(bookings)
		.where(and(eq(bookings.workspaceId, workspaceId), eq(bookings.id, id)))
		.limit(1)
		.for("update");
	if (!booking) throw new Error("BOOKING_NOT_FOUND");

	// Already converted? Return what exists. This is the idempotency guarantee.
	const [existingLine] = await tx
		.select({ invoiceId: invoiceLineItems.invoiceId })
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.where(
			and(
				eq(invoices.workspaceId, workspaceId),
				eq(invoiceLineItems.sourceModule, BOOKING_SOURCE_MODULE),
				eq(invoiceLineItems.sourceRecordId, id),
			),
		)
		.limit(1);
	if (existingLine) {
		const [existing] = await tx
			.select()
			.from(invoices)
			.where(
				and(
					eq(invoices.workspaceId, workspaceId),
					eq(invoices.id, existingLine.invoiceId),
				),
			)
			.limit(1);
		if (!existing) throw new Error("CONVERTED_INVOICE_NOT_FOUND");
		return existing;
	}

	if (!canConvertBooking(booking.status)) {
		throw new Error("BOOKING_NOT_CONVERTIBLE");
	}

	await assertModuleEnabled(tx, workspaceId, "invoicing");

	// The service behind the appointment, if one was attached. A booking without
	// a catalog item still bills — its title becomes the line description and the
	// operator sets the amount — because plenty of appointments are priced on the
	// day rather than picked from a catalogue.
	const service = booking.catalogItemId
		? (
				await tx
					.select({
						name: catalogItems.name,
						description: catalogItems.description,
						priceCents: catalogItems.priceCents,
						currency: catalogItems.currency,
					})
					.from(catalogItems)
					.where(
						and(
							eq(catalogItems.workspaceId, workspaceId),
							eq(catalogItems.id, booking.catalogItemId),
						),
					)
					.limit(1)
			)[0]
		: undefined;

	const [workspace] = await tx
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

	const unitPriceCents = service?.priceCents ?? 0;
	const description = service?.name ?? booking.title;
	const subtotalCents = unitPriceCents;

	const sequence = await allocateInvoiceSequence(tx, workspaceId, now);
	const number = formatInvoiceNumber(numberPrefix, sequence);

	const [invoice] = await tx
		.insert(invoices)
		.values({
			workspaceId,
			clientId: booking.clientId,
			clientName: booking.clientName,
			clientEmail: booking.clientEmail,
			clientCompany: null,
			number,
			status: "draft",
			currency: service?.currency ?? "USD",
			subtotalCents,
			taxCents: 0,
			totalCents: subtotalCents,
			notes: booking.notes,
		})
		.returning();

	await tx.insert(invoiceLineItems).values({
		invoiceId: invoice.id,
		description,
		quantity: 1,
		unitPriceCents,
		// The link that makes this idempotent, and that lets a record detail show
		// "this invoice came from that appointment" without a second table.
		sourceModule: BOOKING_SOURCE_MODULE,
		sourceRecordId: booking.id,
		position: 0,
	});

	return invoice;
}

/**
 * The invoice raised from a booking, if there is one.
 *
 * Reads the same link the conversion writes, so a record detail can show the
 * relationship without storing it twice and without the two ever disagreeing.
 */
export async function getInvoiceForBooking(
	tx: BookingTransaction,
	workspaceId: string,
	bookingId: string,
) {
	const [row] = await tx
		.select({ invoice: invoices })
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.where(
			and(
				eq(invoices.workspaceId, workspaceId),
				eq(invoiceLineItems.sourceModule, BOOKING_SOURCE_MODULE),
				eq(invoiceLineItems.sourceRecordId, bookingId),
			),
		)
		.limit(1);
	return row?.invoice;
}
