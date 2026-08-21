import {
	DEFAULT_ACCENT,
	type EmailBrand,
	escapeHtml,
	formatDate,
	formatMoney,
} from "./brand";
import { button, detailRows, heading, paragraph, renderEmail } from "./layout";

export type { EmailBrand } from "./brand";

/**
 * Transactional templates, sent BY a workspace TO its own customers.
 *
 * Every one returns `{ subject, html, text }`. The plain-text part is not
 * optional politeness: a message with no text alternative scores worse with
 * spam filters, and it is the only version some clients and every screen reader
 * in plain-text mode will show.
 *
 * ⚠️ Amounts arrive in MINOR UNITS (cents), matching storage. Formatting is the
 * templates' job so no caller has to remember to divide.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

export type OrderLine = {
	name: string;
	quantity: number;
	unitAmount: number;
};

/**
 * The sign-in link.
 *
 * ⚠️ The only template the platform depends on rather than the workspace: no
 * link, no customer authentication. It ships before the others for that reason.
 *
 * Deliberately spare. A short-lived credential is a phishing target, so it
 * carries no marketing, no unrelated links, and states the expiry — a recipient
 * who did not ask for it should be able to tell in one glance that ignoring it
 * is safe.
 */
export function signInLinkEmail(input: {
	brand: EmailBrand;
	url: string;
	expiresInMinutes: number;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const body = [
		heading("Sign in"),
		paragraph(
			`Use the link below to sign in to your ${escapeHtml(input.brand.name)} account. It expires in ${input.expiresInMinutes} minutes and can be used once.`,
		),
		button("Sign in", input.url, accent),
		paragraph(
			`<span style="color:#71717a;">If you didn't request this, you can ignore it — nothing will change.</span>`,
		),
	].join("\n");

	return {
		subject: `Sign in to ${input.brand.name}`,
		html: renderEmail({
			brand: input.brand,
			preheader: `Your sign-in link expires in ${input.expiresInMinutes} minutes.`,
			body,
		}),
		text: `Sign in to ${input.brand.name}\n\n${input.url}\n\nThis link expires in ${input.expiresInMinutes} minutes and can be used once. If you didn't request it, ignore this email.`,
	};
}

/**
 * A dashboard notification, delivered to the operator's inbox.
 *
 * 🔴 The same notice the bell shows, sent so it reaches somebody who is not
 * looking at the tab. A low-stock warning nobody happens to see is the same as
 * no warning, and the whole point of a notification is that it finds you.
 *
 * ⚠️ Carries the LINK, not the record. The email is a nudge back into QuickDash;
 * putting order contents or customer details in it would spread business data
 * across an inbox for no gain, and the dashboard is one click away.
 */
export function operatorNotificationEmail(input: {
	brand: EmailBrand;
	title: string;
	body?: string | null;
	url?: string | null;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const parts = [heading(escapeHtml(input.title))];
	if (input.body) parts.push(paragraph(escapeHtml(input.body)));
	if (input.url) parts.push(button("Open QuickDash", input.url, accent));

	return {
		subject: input.title,
		html: renderEmail({
			brand: input.brand,
			preheader: input.body ?? input.title,
			body: parts.join("\n"),
		}),
		text: [input.title, input.body ?? "", input.url ?? ""]
			.filter(Boolean)
			.join("\n\n"),
	};
}

/**
 * An invitation to join an organization.
 *
 * 🔴 The token appears here and nowhere else. It is stored hashed, so this email
 * is the only copy that ever exists — if it is not sent, the invitation is
 * unusable and the person waiting for it has no way to know why.
 *
 * Names the inviter and the organization, because an unexplained link asking you
 * to sign in to a product you have never heard of is indistinguishable from
 * phishing.
 */
export function organizationInviteEmail(input: {
	brand: EmailBrand;
	organizationName: string;
	invitedByName: string | null;
	role: string;
	url: string;
	expiresInDays: number;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const inviter = input.invitedByName
		? `${escapeHtml(input.invitedByName)} invited you`
		: "You have been invited";
	const body = [
		heading(`Join ${escapeHtml(input.organizationName)}`),
		paragraph(
			`${inviter} to join <strong>${escapeHtml(input.organizationName)}</strong> on ${escapeHtml(input.brand.name)} as <strong>${escapeHtml(input.role)}</strong>.`,
		),
		button("Accept invitation", input.url, accent),
		paragraph(
			`<span style="color:#71717a;">This invitation expires in ${input.expiresInDays} day${input.expiresInDays === 1 ? "" : "s"} and can be used once. If you were not expecting it, you can ignore it.</span>`,
		),
	].join("\n");

	return {
		subject: `Join ${input.organizationName} on ${input.brand.name}`,
		html: renderEmail({
			brand: input.brand,
			preheader: `${input.invitedByName ?? "Someone"} invited you to ${input.organizationName}.`,
			body,
		}),
		text: `Join ${input.organizationName} on ${input.brand.name}\n\n${input.invitedByName ?? "Someone"} invited you as ${input.role}.\n\n${input.url}\n\nThis invitation expires in ${input.expiresInDays} day${input.expiresInDays === 1 ? "" : "s"} and can be used once.`,
	};
}

/** Sent the moment an order is recorded. Silence after payment reads as failure. */
export function orderConfirmationEmail(input: {
	brand: EmailBrand;
	orderNumber: string;
	customerName?: string;
	lines: readonly OrderLine[];
	subtotal: number;
	/** Omitted when the workspace does not track it — a "$0.00" shipping row on
	    an order that never had shipping reads as a bug. */
	shipping?: number;
	total: number;
	currency: string;
	viewUrl?: string;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const lines = input.lines.map((line) => ({
		label: `${line.name} × ${line.quantity}`,
		value: formatMoney(line.unitAmount * line.quantity, input.currency),
	}));

	const body = [
		heading("Order confirmed"),
		paragraph(
			`${input.customerName ? `${escapeHtml(input.customerName)}, thanks` : "Thanks"} for your order. Here is what we received.`,
		),
		detailRows([
			...lines,
			{ label: "Subtotal", value: formatMoney(input.subtotal, input.currency) },
			...(input.shipping === undefined
				? []
				: [
						{
							label: "Shipping",
							value: formatMoney(input.shipping, input.currency),
						},
					]),
			{
				label: "Total",
				value: formatMoney(input.total, input.currency),
				strong: true,
			},
		]),
		input.viewUrl ? button("View your order", input.viewUrl, accent) : "",
	].join("\n");

	return {
		subject: `Order ${input.orderNumber} confirmed`,
		html: renderEmail({
			brand: input.brand,
			preheader: `Your order is confirmed — ${formatMoney(input.total, input.currency)}.`,
			body,
		}),
		text: `Order ${input.orderNumber} confirmed\n\n${input.lines
			.map(
				(l) =>
					`${l.name} x${l.quantity}  ${formatMoney(l.unitAmount * l.quantity, input.currency)}`,
			)
			.join(
				"\n",
			)}\n\nTotal ${formatMoney(input.total, input.currency)}${input.viewUrl ? `\n\n${input.viewUrl}` : ""}`,
	};
}

/** Sent when a shipment leaves. Tracking is the entire payload. */
export function shippingNoticeEmail(input: {
	brand: EmailBrand;
	orderNumber: string;
	carrier?: string;
	trackingNumber?: string;
	trackingUrl?: string;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const body = [
		heading("Your order is on its way"),
		paragraph(`Order ${escapeHtml(input.orderNumber)} has shipped.`),
		input.trackingNumber
			? detailRows([
					...(input.carrier
						? [{ label: "Carrier", value: input.carrier }]
						: []),
					{ label: "Tracking", value: input.trackingNumber },
				])
			: "",
		input.trackingUrl
			? button("Track shipment", input.trackingUrl, accent)
			: "",
	].join("\n");

	return {
		subject: `Order ${input.orderNumber} has shipped`,
		html: renderEmail({
			brand: input.brand,
			preheader: input.trackingNumber
				? `Tracking ${input.trackingNumber}`
				: "Your order has shipped.",
			body,
		}),
		text: `Order ${input.orderNumber} has shipped.${input.trackingNumber ? `\n\nTracking: ${input.trackingNumber}` : ""}${input.trackingUrl ? `\n${input.trackingUrl}` : ""}`,
	};
}

/**
 * Sent when a booking is made.
 *
 * The date is formatted server-side rather than sent raw: an appointment is the
 * one thing a recipient must not have to interpret, and a client that renders
 * an ISO string has told them nothing.
 */
export function bookingConfirmationEmail(input: {
	brand: EmailBrand;
	serviceName: string;
	startsAt: Date | string;
	durationMinutes?: number;
	location?: string;
	manageUrl?: string;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const body = [
		heading("Booking confirmed"),
		paragraph(`Your ${escapeHtml(input.serviceName)} is booked.`),
		detailRows([
			{ label: "When", value: formatDate(input.startsAt), strong: true },
			...(input.durationMinutes
				? [{ label: "Duration", value: `${input.durationMinutes} minutes` }]
				: []),
			...(input.location ? [{ label: "Where", value: input.location }] : []),
		]),
		input.manageUrl ? button("Manage booking", input.manageUrl, accent) : "",
	].join("\n");

	return {
		subject: `Booking confirmed — ${formatDate(input.startsAt)}`,
		html: renderEmail({
			brand: input.brand,
			preheader: `${input.serviceName} on ${formatDate(input.startsAt)}`,
			body,
		}),
		text: `Booking confirmed\n\n${input.serviceName}\n${formatDate(input.startsAt)}${input.location ? `\n${input.location}` : ""}${input.manageUrl ? `\n\n${input.manageUrl}` : ""}`,
	};
}

/** A receipt for money actually taken — distinct from the order confirmation. */
export function paymentReceiptEmail(input: {
	brand: EmailBrand;
	reference: string;
	amount: number;
	currency: string;
	paidAt: Date | string;
	method?: string;
	viewUrl?: string;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const body = [
		heading("Payment received"),
		paragraph(
			`We've received your payment of ${escapeHtml(formatMoney(input.amount, input.currency))}.`,
		),
		detailRows([
			{ label: "Reference", value: input.reference },
			{ label: "Paid", value: formatDate(input.paidAt) },
			...(input.method ? [{ label: "Method", value: input.method }] : []),
			{
				label: "Amount",
				value: formatMoney(input.amount, input.currency),
				strong: true,
			},
		]),
		input.viewUrl ? button("View receipt", input.viewUrl, accent) : "",
	].join("\n");

	return {
		subject: `Receipt for ${formatMoney(input.amount, input.currency)}`,
		html: renderEmail({
			brand: input.brand,
			preheader: `Payment of ${formatMoney(input.amount, input.currency)} received.`,
			body,
		}),
		text: `Payment received\n\nReference ${input.reference}\n${formatMoney(input.amount, input.currency)} on ${formatDate(input.paidAt)}${input.viewUrl ? `\n\n${input.viewUrl}` : ""}`,
	};
}

/**
 * Sent when an invoice moves from draft to SENT.
 *
 * 🔴 Deliberately not sent on `invoice.created`. An invoice is drafted, edited,
 * and often corrected before anybody means a customer to see it — emailing on
 * creation would send someone a bill their business had not finished writing.
 * Sending is a separate, deliberate act, and this is the mail for it.
 */
export function invoiceSentEmail(input: {
	brand: EmailBrand;
	invoiceNumber: string;
	customerName?: string;
	lines: readonly OrderLine[];
	subtotal: number;
	tax?: number;
	total: number;
	currency: string;
	dueDate?: Date | string | null;
	payUrl?: string;
}): RenderedEmail {
	const accent = input.brand.accentColor ?? DEFAULT_ACCENT;
	const lines = input.lines.map((line) => ({
		label: `${line.name} × ${line.quantity}`,
		value: formatMoney(line.unitAmount * line.quantity, input.currency),
	}));

	const body = [
		heading(`Invoice ${input.invoiceNumber}`),
		paragraph(
			input.customerName
				? `Hi ${escapeHtml(input.customerName)}, here is your invoice from ${escapeHtml(input.brand.name)}.`
				: `Here is your invoice from ${escapeHtml(input.brand.name)}.`,
		),
		detailRows([
			...lines,
			{ label: "Subtotal", value: formatMoney(input.subtotal, input.currency) },
			// Omitted when zero. A "$0.00 tax" row on an invoice that never had tax
			// reads as a mistake rather than as information.
			...(input.tax
				? [{ label: "Tax", value: formatMoney(input.tax, input.currency) }]
				: []),
			{
				label: "Amount due",
				value: formatMoney(input.total, input.currency),
				strong: true,
			},
			...(input.dueDate
				? [{ label: "Due", value: formatDate(input.dueDate) }]
				: []),
		]),
		input.payUrl ? button("Pay this invoice", input.payUrl, accent) : "",
	].join("\n");

	return {
		subject: `Invoice ${input.invoiceNumber} from ${input.brand.name}`,
		html: renderEmail({
			brand: input.brand,
			preheader: `${formatMoney(input.total, input.currency)} due${input.dueDate ? ` by ${formatDate(input.dueDate)}` : ""}.`,
			body,
		}),
		text: `Invoice ${input.invoiceNumber} from ${input.brand.name}\n\n${input.lines
			.map(
				(line) =>
					`${line.name} x${line.quantity}  ${formatMoney(line.unitAmount * line.quantity, input.currency)}`,
			)
			.join("\n")}\n\nAmount due: ${formatMoney(input.total, input.currency)}${
			input.dueDate ? `\nDue: ${formatDate(input.dueDate)}` : ""
		}${input.payUrl ? `\n\nPay: ${input.payUrl}` : ""}`,
	};
}
