import {
	bookings,
	clientRecords,
	db,
	eq,
	invoiceLineItems,
	invoices,
	orderLineItems,
	orders,
	payments,
	recordCustomerLifecycleMessage,
	resolveBrand,
	shipments,
} from "@quickengine/db";
// 🔴 The TEMPLATES subpath, not the package root.
//
// The root exports the Resend client, so importing it here dragged a mail SDK
// into the module graph of everything that touches event-dispatch — which
// includes four files in the API, and made its route-table test time out in CI.
// Templates are pure string builders and cost nothing; the provider is loaded
// only when something is actually sent.
import type { EmailBrand, RenderedEmail } from "@quickengine/email/templates";
import {
	bookingConfirmationEmail,
	invoiceSentEmail,
	orderConfirmationEmail,
	paymentReceiptEmail,
	shippingNoticeEmail,
} from "@quickengine/email/templates";
import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * Transactional email to our USERS' USERS.
 *
 * 🔴 This closes the original leak: a customer used to buy something and receive
 * absolutely nothing. Silence after a payment reads as failure, and it is worse
 * than a missing portal — most of the internet has no customer portal, and none
 * of it is silent after taking money.
 *
 * Driven by the outbox rather than called from the write path, deliberately:
 *
 * · An email must never be able to roll back a sale. The order commits, the
 *   event commits with it, and delivery is a separate concern that can fail,
 *   retry, or be replayed without touching domain state.
 * · At-least-once delivery means a handler can run twice, so nothing here
 *   mutates anything. Worst case is a duplicate email, which is recoverable;
 *   a duplicated charge would not be.
 * · Events already carry the workspace, so branding resolves per business
 *   without the modules knowing email exists.
 *
 * ⚠️ Every send is best-effort. A throw here would fail the whole outbox event
 * and block the activity feed, realtime and webhooks behind a mail provider —
 * so failures are logged and swallowed. That is a real trade: a customer can
 * silently miss a receipt. The alternative is one flaky provider stalling every
 * workspace's event stream.
 */

type Notification = { to: string; email: RenderedEmail };

/**
 * The only events that produce mail.
 *
 * 🔴 Checked FIRST, before any I/O. Every mutation in the platform raises an
 * event — `task.updated`, `project.archived`, hundreds per test run — and
 * without this gate the handler loaded the workspace from the database for all
 * of them just to discover it had no template. That is a query per event on the
 * hot path of the outbox drain, and it made the integration suite measurably
 * slower before anyone noticed.
 */
const NOTIFIED_EVENTS = new Set([
	"order.paid",
	"payment.recorded",
	"shipment.created",
	"booking.created",
	// 🔴 Not `invoice.created`. An invoice is drafted, edited and often corrected
	// before anybody means a customer to see it — mailing on creation sends
	// somebody a bill the business had not finished writing. SENDING is the
	// deliberate act, and it arrives as a status change.
	"invoice.status-changed",
]);

async function recordLifecycle(event: OutboxEvent) {
	switch (event.eventName) {
		case "order.paid": {
			const [order] = await db
				.select()
				.from(orders)
				.where(eq(orders.id, event.aggregateId))
				.limit(1);
			if (!order) return;
			await recordCustomerLifecycleMessage({
				workspaceId: event.workspaceId,
				clientRecordId: order.clientId,
				topicKey: `order:${order.id}`,
				subject: `Order ${order.number}`,
				body: "Your order was paid and confirmed.",
				eventId: event.id,
			});
			return;
		}
		case "payment.recorded": {
			const [payment] = await db
				.select()
				.from(payments)
				.where(eq(payments.id, event.aggregateId))
				.limit(1);
			if (!payment) return;
			await recordCustomerLifecycleMessage({
				workspaceId: event.workspaceId,
				clientRecordId: payment.clientId,
				topicKey: `payment:${payment.id}`,
				subject: "Payment update",
				body: "Your payment was recorded.",
				eventId: event.id,
			});
			return;
		}
		case "shipment.created": {
			const [shipment] = await db
				.select()
				.from(shipments)
				.where(eq(shipments.id, event.aggregateId))
				.limit(1);
			if (!shipment?.orderId) return;
			const [order] = await db
				.select()
				.from(orders)
				.where(eq(orders.id, shipment.orderId))
				.limit(1);
			if (!order) return;
			await recordCustomerLifecycleMessage({
				workspaceId: event.workspaceId,
				clientRecordId: order.clientId,
				topicKey: `order:${order.id}`,
				subject: `Order ${order.number}`,
				body: shipment.trackingNumber
					? `Your order shipped. Tracking: ${shipment.trackingNumber}`
					: "Your order shipped.",
				eventId: event.id,
			});
			return;
		}
		case "booking.created": {
			const [booking] = await db
				.select()
				.from(bookings)
				.where(eq(bookings.id, event.aggregateId))
				.limit(1);
			if (!booking) return;
			await recordCustomerLifecycleMessage({
				workspaceId: event.workspaceId,
				clientRecordId: booking.clientId,
				topicKey: `booking:${booking.id}`,
				subject: booking.title || "Booking",
				body: "Your booking was confirmed.",
				eventId: event.id,
			});
			return;
		}
		case "invoice.status-changed": {
			if ((event.payload as { status?: string } | null)?.status !== "sent")
				return;
			const [invoice] = await db
				.select()
				.from(invoices)
				.where(eq(invoices.id, event.aggregateId))
				.limit(1);
			if (!invoice) return;
			await recordCustomerLifecycleMessage({
				workspaceId: event.workspaceId,
				clientRecordId: invoice.clientId,
				topicKey: `invoice:${invoice.id}`,
				subject: `Invoice ${invoice.number}`,
				body: "Your invoice is ready.",
				eventId: event.id,
			});
		}
	}
}

/**
 * How the business appears in mail to its own customers.
 *
 * Every fallback lives in `resolveBrand`, not here, so a receipt and the portal
 * cannot disagree about a business's name or colour. A workspace that has never
 * opened Connect still gets mail — its own name, and the platform support
 * address as a last resort.
 */
async function brandFor(workspaceId: string): Promise<EmailBrand | null> {
	const brand = await resolveBrand(workspaceId);
	if (!brand) return null;
	return {
		name: brand.name,
		supportEmail: brand.supportEmail,
		logoUrl: brand.logoUrl,
		tagline: brand.tagline,
		accentColor: brand.accentColor,
		websiteUrl: brand.websiteUrl,
	};
}

/**
 * Where to write, preferring the address captured ON the record.
 *
 * Orders, payments and bookings each snapshot `clientEmail` at write time, and
 * that is the better source: a GUEST purchase has no `clientId` at all but does
 * have the address the buyer typed. Falling back to the client record covers
 * rows written before the snapshot, or where only a link exists.
 */
async function recipientFor(
	snapshot: string | null,
	clientId: string | null,
): Promise<string | null> {
	if (snapshot?.trim()) return snapshot.trim();
	if (!clientId) return null;
	const [client] = await db
		.select({ email: clientRecords.email })
		.from(clientRecords)
		.where(eq(clientRecords.id, clientId))
		.limit(1);
	return client?.email ?? null;
}

async function buildNotification(
	event: OutboxEvent,
	brand: EmailBrand,
): Promise<Notification | null> {
	switch (event.eventName) {
		case "order.paid": {
			const [order] = await db
				.select()
				.from(orders)
				.where(eq(orders.id, event.aggregateId))
				.limit(1);
			if (!order) return null;
			const to = await recipientFor(order.clientEmail, order.clientId);
			if (!to) return null;
			return {
				to,
				email: orderConfirmationEmail({
					brand,
					orderNumber: order.number,
					customerName: order.clientName || undefined,
					// Loaded in `position` order, which is the order the customer built
					// the basket in. Sorting by name or price would rearrange somebody's
					// own order in front of them for no reason.
					lines: await db
						.select({
							name: orderLineItems.name,
							quantity: orderLineItems.quantity,
							unitAmount: orderLineItems.unitPriceCents,
						})
						.from(orderLineItems)
						.where(eq(orderLineItems.orderId, order.id))
						.orderBy(orderLineItems.position),
					subtotal: order.subtotalCents ?? 0,
					total: order.totalCents ?? 0,
					currency: order.currency ?? "CAD",
				}),
			};
		}

		case "payment.recorded": {
			const [payment] = await db
				.select()
				.from(payments)
				.where(eq(payments.id, event.aggregateId))
				.limit(1);
			if (!payment) return null;
			const to = await recipientFor(payment.clientEmail, payment.clientId);
			if (!to) return null;
			return {
				to,
				email: paymentReceiptEmail({
					brand,
					reference: payment.reference ?? payment.id,
					amount: payment.amountCents ?? 0,
					currency: payment.currency ?? "CAD",
					// The moment money actually moved, not the moment the row was
					// written — they differ for anything recorded after the fact.
					paidAt: payment.succeededAt ?? payment.createdAt,
					method: payment.paymentMethod ?? undefined,
				}),
			};
		}

		case "shipment.created": {
			const [shipment] = await db
				.select()
				.from(shipments)
				.where(eq(shipments.id, event.aggregateId))
				.limit(1);
			if (!shipment) return null;
			const [order] = shipment.orderId
				? await db
						.select()
						.from(orders)
						.where(eq(orders.id, shipment.orderId))
						.limit(1)
				: [];
			// A shipment carries no email of its own; the order it belongs to does.
			const to = await recipientFor(
				order?.clientEmail ?? null,
				order?.clientId ?? null,
			);
			if (!to) return null;
			return {
				to,
				email: shippingNoticeEmail({
					brand,
					orderNumber: order?.number ?? shipment.id,
					carrier: shipment.carrier ?? undefined,
					trackingNumber: shipment.trackingNumber ?? undefined,
					trackingUrl: shipment.trackingUrl ?? undefined,
				}),
			};
		}

		case "invoice.status-changed": {
			// Only the draft → sent transition. Every other status change on this
			// event — paid, void — is either the business's own bookkeeping or
			// already covered by the payment receipt.
			const status = (event.payload as { status?: string } | null)?.status;
			if (status !== "sent") return null;

			const [invoice] = await db
				.select()
				.from(invoices)
				.where(eq(invoices.id, event.aggregateId))
				.limit(1);
			if (!invoice) return null;
			const to = await recipientFor(invoice.clientEmail, invoice.clientId);
			if (!to) return null;

			const lines = await db
				.select({
					name: invoiceLineItems.description,
					quantity: invoiceLineItems.quantity,
					unitAmount: invoiceLineItems.unitPriceCents,
				})
				.from(invoiceLineItems)
				.where(eq(invoiceLineItems.invoiceId, invoice.id))
				.orderBy(invoiceLineItems.position);

			return {
				to,
				email: invoiceSentEmail({
					brand,
					invoiceNumber: invoice.number,
					customerName: invoice.clientName || undefined,
					lines,
					subtotal: invoice.subtotalCents ?? 0,
					tax: invoice.taxCents ?? 0,
					total: invoice.totalCents ?? 0,
					currency: invoice.currency ?? "CAD",
					dueDate: invoice.dueAt,
				}),
			};
		}

		case "booking.created": {
			const [booking] = await db
				.select()
				.from(bookings)
				.where(eq(bookings.id, event.aggregateId))
				.limit(1);
			if (!booking) return null;
			const to = await recipientFor(booking.clientEmail, booking.clientId);
			if (!to) return null;
			return {
				to,
				email: bookingConfirmationEmail({
					brand,
					serviceName: booking.title || "your appointment",
					startsAt: booking.startsAt,
					location: booking.location ?? undefined,
				}),
			};
		}

		// ⚠️ `invoice.created` is deliberately absent. An invoice is drafted before
		// it is sent, and emailing a customer the moment one is written would
		// deliver drafts. It belongs on an `invoice.sent` event, which does not
		// exist yet.
		default:
			return null;
	}
}

/** Loaded on first send, never at import. See the note on the imports above. */
async function defaultSend(input: {
	to: string;
	subject: string;
	html: string;
	text: string;
}) {
	const { getEmailProvider } = await import("@quickengine/email");
	return getEmailProvider().send(input);
}

export function customerNotificationHandler(
	send: (input: {
		to: string;
		subject: string;
		html: string;
		text: string;
	}) => Promise<unknown> = defaultSend,
	log: (message: string, detail: Record<string, unknown>) => void = (
		message,
		detail,
	) => console.error(message, detail),
): OutboxHandler {
	return {
		name: "customer-notifications",
		async handle(event: OutboxEvent) {
			// Cheapest possible rejection: a string lookup, no database, no imports.
			if (!NOTIFIED_EVENTS.has(event.eventName)) return;

			// Neither delivery channel is allowed to block the other.
			try {
				await recordLifecycle(event);
			} catch (error) {
				log("customer_portal_notification.failed", {
					error,
					eventId: event.id,
					eventName: event.eventName,
				});
			}

			try {
				const brand = await brandFor(event.workspaceId);
				if (!brand) return;

				const notification = await buildNotification(event, brand);
				if (!notification) return;

				await send({
					to: notification.to,
					subject: notification.email.subject,
					html: notification.email.html,
					text: notification.email.text,
				});
			} catch (error) {
				// Swallowed on purpose — see the note at the top of this file.
				log("customer_notification.failed", {
					error,
					eventId: event.id,
					eventName: event.eventName,
				});
			}
		},
	};
}
