import type { EmailBrand, TemplateCopy } from "./brand";
import {
	bookingConfirmationEmail,
	invoiceSentEmail,
	messageReplyEmail,
	orderConfirmationEmail,
	paymentReceiptEmail,
	type RenderedEmail,
	refundNoticeEmail,
	shippingNoticeEmail,
	signInLinkEmail,
	subscriptionPaymentFailedEmail,
} from "./index";

/**
 * Every template a customer can receive, rendered with a business's own brand.
 *
 * ── Why sample data lives HERE ───────────────────────────────────────────────
 *
 * 🔴 Beside the templates, not in the route that shows them. A template gaining
 * a field must break the preview in the same package, at build time — not
 * silently render an empty row on a settings screen that somebody then approves.
 *
 * ⚠️ The sample is deliberately awkward: a long product name, two lines, a
 * decimal quantity of money, a real tracking number. A preview built from
 * "Item · 1 · $10.00" proves the template renders and nothing about whether it
 * survives what a real business sells.
 *
 * These are the six a CUSTOMER receives. `operatorNotificationEmail` and
 * `organizationInviteEmail` are internal — a business does not brand mail sent
 * to its own staff about the platform, and offering to would be confusing.
 */

export type EmailTemplateKey =
	| "order-confirmation"
	| "shipping-notice"
	| "payment-receipt"
	| "refund-notice"
	| "message-reply"
	| "subscription-payment-failed"
	| "invoice-sent"
	| "booking-confirmation"
	| "sign-in-link";

export type EmailTemplatePreview = {
	key: EmailTemplateKey;
	/**
	 * The built-in email, fully rendered.
	 *
	 * 🔑 This is what an editor loads when somebody first opens it. Starting from
	 * the real thing makes editing a CHANGE rather than an invention, and it
	 * means "reset" has something honest to return to.
	 */
	defaultHtml: string;
	/** What this is, in the words of somebody who did not write it. */
	name: string;
	/** Which `{tokens}` this template understands, for the editor to list. */
	tokens: readonly string[];
	/** When a customer gets it. The question every operator asks first. */
	sentWhen: string;
	rendered: RenderedEmail;
};

const SAMPLE_LINES = [
	{ name: "Ethiopia Guji · whole bean · 340g", quantity: 2, unitAmount: 2200 },
	{ name: "House Process · ground · 340g", quantity: 1, unitAmount: 1950 },
];

export function emailTemplatePreviews(
	brand: EmailBrand,
	/**
	 * A business's own wording, by template key. Anything unset falls back to
	 * the built-in copy, which is what most workspaces will always use.
	 */
	copy: Record<string, TemplateCopy | undefined> = {},
): EmailTemplatePreview[] {
	const currency = "CAD";
	/**
	 * 🔑 Built TWICE: once with the business's own HTML to show what a customer
	 * receives, once without to give the editor something honest to start from
	 * and to reset back to.
	 */
	const build = (
		override: Record<string, TemplateCopy | undefined>,
	): Omit<EmailTemplatePreview, "defaultHtml">[] => [
		{
			key: "order-confirmation",
			tokens: ["customerName", "orderNumber", "total", "businessName"],
			name: "Order confirmed",
			sentWhen: "As soon as a customer's payment succeeds.",
			rendered: orderConfirmationEmail({
				brand,
				copy: override["order-confirmation"],
				orderNumber: "ORD-1042",
				customerName: "Ada Lovelace",
				lines: SAMPLE_LINES,
				subtotal: 6350,
				shipping: 900,
				total: 7250,
				currency,
			}),
		},
		{
			key: "shipping-notice",
			tokens: ["orderNumber", "carrier", "trackingNumber", "businessName"],
			name: "On its way",
			sentWhen:
				"When a shipment is marked shipped — including one a supplier fulfils for you.",
			rendered: shippingNoticeEmail({
				brand,
				copy: override["shipping-notice"],
				orderNumber: "ORD-1042",
				carrier: "Canada Post",
				trackingNumber: "1234567890123456",
				trackingUrl:
					"https://www.canadapost-postescanada.ca/track/1234567890123456",
			}),
		},
		{
			key: "payment-receipt",
			tokens: ["reference", "amount", "businessName"],
			name: "Payment received",
			sentWhen: "When a payment is recorded against an order or invoice.",
			rendered: paymentReceiptEmail({
				brand,
				copy: override["payment-receipt"],
				reference: "ORD-1042",
				amount: 7250,
				currency,
				paidAt: new Date("2026-08-21T18:30:00Z"),
				method: "card",
			}),
		},
		{
			key: "refund-notice",
			tokens: ["reference", "amount", "orderNumber", "businessName"],
			name: "Refund sent",
			sentWhen: "When money is refunded to a customer.",
			rendered: refundNoticeEmail({
				brand,
				copy: override["refund-notice"],
				reference: "re_1042",
				amount: 2900,
				currency,
				refundedAt: new Date("2026-08-28T09:30:00Z"),
				orderNumber: "ORD-1042",
			}),
		},
		{
			key: "subscription-payment-failed",
			tokens: ["planName", "businessName"],
			name: "Subscription payment failed",
			sentWhen:
				"When a subscription renewal cannot be charged, and again if it ends.",
			rendered: subscriptionPaymentFailedEmail({
				brand,
				copy: override["subscription-payment-failed"],
				planName: "Monthly coffee",
				outcome: "past_due",
			}),
		},
		{
			key: "message-reply",
			tokens: ["messageSubject", "businessName"],
			name: "Reply to a message",
			sentWhen: "When you reply to a customer's message.",
			rendered: messageReplyEmail({
				brand,
				copy: override["message-reply"],
				subject: "Where is my order?",
			}),
		},
		{
			key: "invoice-sent",
			tokens: ["invoiceNumber", "customerName", "total", "businessName"],
			name: "Invoice",
			sentWhen: "When you send an invoice. Never when you draft one.",
			rendered: invoiceSentEmail({
				brand,
				copy: override["invoice-sent"],
				invoiceNumber: "INV-0117",
				customerName: "Ada Lovelace",
				lines: SAMPLE_LINES,
				subtotal: 6350,
				tax: 318,
				total: 6668,
				currency,
				dueDate: new Date("2026-09-04T00:00:00Z"),
			}),
		},
		{
			key: "booking-confirmation",
			tokens: ["serviceName", "businessName"],
			name: "Booking confirmed",
			sentWhen: "When a customer books a time with you.",
			rendered: bookingConfirmationEmail({
				brand,
				copy: override["booking-confirmation"],
				serviceName: "Cupping session",
				startsAt: new Date("2026-09-02T15:00:00Z"),
				durationMinutes: 45,
				location: "The roastery",
			}),
		},
		{
			key: "sign-in-link",
			tokens: ["businessName"],
			name: "Sign in",
			sentWhen:
				"When a customer asks to sign in. Deliberately spare — it carries a credential.",
			rendered: signInLinkEmail({
				brand,
				copy: override["sign-in-link"],
				url: "https://example.com/sign-in?token=preview",
				expiresInMinutes: 15,
			}),
		},
	];

	const authored = build(copy);
	const builtIn = build({});
	return authored.map((template, index) => ({
		...template,
		defaultHtml: builtIn[index].rendered.html,
	}));
}
