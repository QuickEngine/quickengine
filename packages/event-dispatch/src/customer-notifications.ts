// Type-only: erased at compile time, so it adds nothing to the module graph.
import type { EmailTemplateCopy } from "@quickengine/db";
import {
	and,
	bookings,
	clientRecords,
	customerConversations,
	customerIdentities,
	db,
	eq,
	invoiceLineItems,
	invoices,
	orderLineItems,
	orders,
	paymentRefunds,
	payments,
	readEmailTemplateCopy,
	recordCustomerLifecycleMessage,
	resolveBrand,
	shipments,
	workspaceCustomers,
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
	messageReplyEmail,
	orderConfirmationEmail,
	paymentReceiptEmail,
	refundNoticeEmail,
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
	/**
	 * 🔴 Money going BACK is as much a customer's business as money going out.
	 *
	 * Nothing told them. A refund reversed the charge and the customer saw an
	 * unexplained movement days later, or wrote in asking where their order was.
	 */
	"payment.refunded",
	/**
	 * 🔴 The business ANSWERED. Without this the reply sits in a portal the
	 * customer has no reason to open again, so their question reads as ignored.
	 */
	"customer.message.replied",
	/**
	 * 🔴 `shipment.status-changed`, NOT `shipment.created`.
	 *
	 * A shipment is created as a DRAFT while somebody is still packing it, so
	 * mailing on creation tells a customer their order has shipped before it has
	 * — and if that draft is then cancelled, they were told about a parcel that
	 * never existed. This is the same rule the invoice note below states:
	 * sending is the deliberate act, and it arrives as a status change.
	 */
	"shipment.status-changed",
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
		case "shipment.status-changed": {
			/**
			 * 🔴 Only when the parcel actually LEAVES. This event also fires for
			 * `ready`, `exception` and `cancelled`, and none of those are news a
			 * customer should receive as "your order has shipped".
			 */
			if ((event.payload as { status?: string } | null)?.status !== "shipped")
				return;
			const [shipment] = await db
				.select()
				.from(shipments)
				.where(
					and(
						eq(shipments.workspaceId, event.workspaceId),
						eq(shipments.id, event.aggregateId),
					),
				)
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
/**
 * ⚠️ `EmailBrand` plus a sender, not `EmailBrand` itself.
 *
 * Templates render a brand; they have no business knowing what address the mail
 * leaves from. Widening the template type would push a transport concern into
 * every one of them.
 */
async function brandFor(
	workspaceId: string,
): Promise<(EmailBrand & { sender?: string }) | null> {
	const brand = await resolveBrand(workspaceId);
	if (!brand) return null;
	return {
		name: brand.name,
		supportEmail: brand.supportEmail,
		sender: brand.sender,
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
/**
 * Who this email goes to.
 *
 * 🔴 `workspaceId` is not optional and must come from the EVENT. This resolves
 * an address that a customer then receives an order's contents at, so an id from
 * outside the workspace would send one business's order details to another
 * business's customer. There is no session here for anything to refuse.
 */
async function recipientFor(
	workspaceId: string,
	snapshot: string | null,
	clientId: string | null,
): Promise<string | null> {
	if (snapshot?.trim()) return snapshot.trim();
	if (!clientId) return null;
	const [client] = await db
		.select({ email: clientRecords.email })
		.from(clientRecords)
		.where(
			and(
				eq(clientRecords.workspaceId, workspaceId),
				eq(clientRecords.id, clientId),
			),
		)
		.limit(1);
	return client?.email ?? null;
}

/**
 * ⚠️ `copy` is the business's OWN wording, keyed by template.
 *
 * 🔴 It used to be read only by the preview and the test send, so editing a
 * template in settings changed what the operator saw and what a test email
 * looked like — and every real customer kept receiving the built-in default.
 * Found on 2026-08-28 after a workspace customised its templates and the live
 * order confirmation ignored all of it.
 */
async function buildNotification(
	event: OutboxEvent,
	brand: EmailBrand,
	copy: Record<string, EmailTemplateCopy>,
): Promise<Notification | null> {
	switch (event.eventName) {
		case "order.paid": {
			const [order] = await db
				.select()
				.from(orders)
				.where(
					and(
						eq(orders.workspaceId, event.workspaceId),
						eq(orders.id, event.aggregateId),
					),
				)
				.limit(1);
			if (!order) return null;
			const to = await recipientFor(
				event.workspaceId,
				order.clientEmail,
				order.clientId,
			);
			if (!to) return null;
			return {
				to,
				email: orderConfirmationEmail({
					brand,
					copy: copy["order-confirmation"],
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
						/**
						 * ⚠️ No workspace predicate, and correctly so: `order_line_items`
						 * has no workspace column. It is scoped THROUGH its order, and the
						 * order above is scoped to `event.workspaceId` — so a line can
						 * only be reached via an order this workspace owns.
						 */
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
				.where(
					and(
						eq(payments.workspaceId, event.workspaceId),
						eq(payments.id, event.aggregateId),
					),
				)
				.limit(1);
			if (!payment) return null;
			const to = await recipientFor(
				event.workspaceId,
				payment.clientEmail,
				payment.clientId,
			);
			if (!to) return null;
			return {
				to,
				email: paymentReceiptEmail({
					brand,
					copy: copy["payment-receipt"],
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

		case "payment.refunded": {
			const payload = (event.payload ?? {}) as { refundId?: string };
			const [payment] = await db
				.select()
				.from(payments)
				.where(
					and(
						eq(payments.workspaceId, event.workspaceId),
						eq(payments.id, event.aggregateId),
					),
				)
				.limit(1);
			if (!payment) return null;

			/**
			 * ⚠️ The REFUND's amount, not the payment's. A partial refund that
			 * announced the full order value would be telling somebody they are
			 * getting back more than they are.
			 */
			const [refund] = payload.refundId
				? await db
						.select()
						.from(paymentRefunds)
						.where(
							and(
								eq(paymentRefunds.workspaceId, event.workspaceId),
								eq(paymentRefunds.id, payload.refundId),
							),
						)
						.limit(1)
				: [];
			if (!refund) return null;

			const to = await recipientFor(
				event.workspaceId,
				payment.clientEmail,
				payment.clientId,
			);
			if (!to) return null;

			const [order] = payment.orderId
				? await db
						.select({ number: orders.number })
						.from(orders)
						.where(
							and(
								eq(orders.workspaceId, event.workspaceId),
								eq(orders.id, payment.orderId),
							),
						)
						.limit(1)
				: [];

			return {
				to,
				email: refundNoticeEmail({
					brand,
					copy: copy["refund-notice"],
					reference: refund.id,
					amount: refund.amountCents,
					currency: payment.currency,
					refundedAt: refund.createdAt ?? new Date(),
					orderNumber: order?.number,
				}),
			};
		}

		case "customer.message.replied": {
			const [conversation] = await db
				.select({
					id: customerConversations.id,
					subject: customerConversations.subject,
					workspaceCustomerId: customerConversations.workspaceCustomerId,
				})
				.from(customerConversations)
				.where(
					and(
						eq(customerConversations.workspaceId, event.workspaceId),
						eq(customerConversations.id, event.aggregateId),
					),
				)
				.limit(1);
			if (!conversation) return null;

			/**
			 * ⚠️ The identity's address, not a snapshot on the conversation.
			 * A customer signs in with that email; it is the one they can actually
			 * read a reply from.
			 */
			const [customer] = await db
				.select({ email: customerIdentities.email })
				.from(workspaceCustomers)
				.innerJoin(
					customerIdentities,
					eq(customerIdentities.id, workspaceCustomers.identityId),
				)
				.where(
					and(
						eq(workspaceCustomers.workspaceId, event.workspaceId),
						eq(workspaceCustomers.id, conversation.workspaceCustomerId),
					),
				)
				.limit(1);
			if (!customer?.email) return null;

			return {
				to: customer.email,
				email: messageReplyEmail({
					brand,
					copy: copy["message-reply"],
					subject: conversation.subject,
				}),
			};
		}

		case "shipment.status-changed": {
			// Same gate as above: shipped only. See the note there.
			if ((event.payload as { status?: string } | null)?.status !== "shipped")
				return null;
			const [shipment] = await db
				.select()
				.from(shipments)
				.where(
					and(
						eq(shipments.workspaceId, event.workspaceId),
						eq(shipments.id, event.aggregateId),
					),
				)
				.limit(1);
			if (!shipment) return null;
			const [order] = shipment.orderId
				? await db
						.select()
						.from(orders)
						.where(
							and(
								eq(orders.workspaceId, event.workspaceId),
								eq(orders.id, shipment.orderId),
							),
						)
						.limit(1)
				: [];
			// A shipment carries no email of its own; the order it belongs to does.
			const to = await recipientFor(
				event.workspaceId,
				order?.clientEmail ?? null,
				order?.clientId ?? null,
			);
			if (!to) return null;
			return {
				to,
				email: shippingNoticeEmail({
					brand,
					copy: copy["shipping-notice"],
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
			const to = await recipientFor(
				event.workspaceId,
				invoice.clientEmail,
				invoice.clientId,
			);
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
					copy: copy["invoice-sent"],
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
			const to = await recipientFor(
				event.workspaceId,
				booking.clientEmail,
				booking.clientId,
			);
			if (!to) return null;
			return {
				to,
				email: bookingConfirmationEmail({
					brand,
					copy: copy["booking-confirmation"],
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
		/** The business's own `From:`. Absent means the platform sender. */
		from?: string;
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

				// Read once per event rather than per template: one row set covers
				// every email this workspace has rewritten.
				const copy = await readEmailTemplateCopy(event.workspaceId);
				const notification = await buildNotification(event, brand, copy);
				if (!notification) return;

				/**
				 * 🔴 `from` is what stops a Caffeinate receipt arriving as QuickEngine.
				 *
				 * Undefined when the workspace has not set a sender, in which case the
				 * transport uses the platform address — the state every workspace
				 * starts in.
				 */
				await send({
					to: notification.to,
					from: brand.sender,
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
