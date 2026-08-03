import {
	bookings,
	clientRecords,
	db,
	eq,
	invoices,
	orders,
	payments,
	quickengineWorkspaces,
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
	"order.created",
	"payment.recorded",
	"shipment.created",
	"booking.created",
]);

/**
 * How the business appears in mail to its own customers.
 *
 * ⚠️ `supportEmail` falls back to the workspace name at a placeholder domain
 * because there is no `workspace_branding` table yet. That is the one remaining
 * place the platform shows through, and it is tracked — nothing else in these
 * emails mentions QuickEngine.
 */
async function brandFor(workspaceId: string): Promise<EmailBrand | null> {
	const [workspace] = await db
		.select({ name: quickengineWorkspaces.name })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) return null;
	return {
		name: workspace.name,
		supportEmail: process.env.CUSTOMER_SUPPORT_EMAIL ?? "support@quickdash.xyz",
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
		case "order.created": {
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
					// ⚠️ Line items are a separate table and are not loaded here yet, so
					// the mail shows totals only. Correct, but thin — worth filling in
					// before anyone sells with it.
					lines: [],
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
