import { describe, expect, it } from "vitest";
import type { EmailBrand } from "./brand";
import {
	bookingConfirmationEmail,
	invoiceSentEmail,
	orderConfirmationEmail,
	paymentReceiptEmail,
	shippingNoticeEmail,
	signInLinkEmail,
} from "./index";

// DB_RULES rule 4: fixtures must contain the values that break things. A name
// with an apostrophe, one with angle brackets, and one long enough to wrap are
// what actually exercise escaping and layout — a suite of tidy single words
// proves the happy path and nothing else.
const brand: EmailBrand = {
	name: "Reese's Gems & Co <Ltd>",
	supportEmail: "hello@gemsutopia.com",
	tagline: "Ethically sourced",
	accentColor: "#7c3aed",
	websiteUrl: "https://gemsutopia.com",
};

const everyTemplate = () => [
	signInLinkEmail({
		brand,
		url: "https://x.test/s?t=a&b=c",
		expiresInMinutes: 15,
	}),
	orderConfirmationEmail({
		brand,
		orderNumber: "GEM-1001",
		customerName: "Ash <O'Neill>",
		lines: [{ name: 'Amethyst "raw" 12mm', quantity: 2, unitAmount: 4599 }],
		subtotal: 9198,
		shipping: 1200,
		total: 10398,
		currency: "CAD",
	}),
	shippingNoticeEmail({
		brand,
		orderNumber: "GEM-1001",
		carrier: "Canada Post",
		trackingNumber: "1Z<999>",
		trackingUrl: "https://x.test/t?id=1&z=2",
	}),
	bookingConfirmationEmail({
		brand,
		serviceName: "90-minute massage",
		startsAt: "2026-09-01T17:30:00.000Z",
		durationMinutes: 90,
		location: "12 King St W",
	}),
	paymentReceiptEmail({
		brand,
		reference: "pay_abc123",
		amount: 10398,
		currency: "CAD",
		paidAt: "2026-09-01T17:30:00.000Z",
		method: "Visa ••4242",
	}),
];

describe("transactional templates", () => {
	it("escapes brand and customer text into HTML", () => {
		for (const email of everyTemplate()) {
			// The raw angle brackets from the brand name must never survive. If they
			// do, any workspace can inject script into mail sent to its customers.
			expect(email.html).not.toContain("<Ltd>");
			expect(email.html).toContain("&lt;Ltd&gt;");
		}
	});

	it("never leaks the platform into a workspace's mail", () => {
		for (const email of everyTemplate()) {
			// These emails are from the business, not from us. A shopper has no
			// relationship with QuickEngine and must not learn of one here.
			const haystack =
				`${email.subject} ${email.html} ${email.text}`.toLowerCase();
			expect(haystack).not.toContain("quickengine");
			expect(haystack).not.toContain("quickdash");
			expect(haystack).not.toContain("powered by");
		}
	});

	it("always ships a plain-text alternative", () => {
		for (const email of everyTemplate()) {
			expect(email.text.trim().length).toBeGreaterThan(0);
			expect(email.subject.trim().length).toBeGreaterThan(0);
		}
	});

	it("formats minor units as money, never as raw integers", () => {
		const email = orderConfirmationEmail({
			brand,
			orderNumber: "GEM-1",
			lines: [{ name: "Opal", quantity: 1, unitAmount: 10398 }],
			subtotal: 10398,
			shipping: 0,
			total: 10398,
			currency: "CAD",
		});
		expect(email.text).toContain("103.98");
		// The stored integer must not appear anywhere — that would be a $10,398 bill.
		expect(email.text).not.toContain("10398");
	});

	it("keeps the sign-in link free of anything but the link", () => {
		const email = signInLinkEmail({
			brand,
			url: "https://x.test/s?t=a&b=c",
			expiresInMinutes: 15,
		});
		// A short-lived credential is a phishing target; extra links and offers are
		// exactly what trains people to click without reading.
		const links = email.html.match(/href="/g) ?? [];
		// The sign-in button, the support mailto, and the workspace's own site.
		expect(links.length).toBeLessThanOrEqual(3);
		expect(email.text).toContain("15 minutes");
	});
});

describe("order confirmation line items", () => {
	it("lists what was actually bought, not just a total", () => {
		// 🔴 The mail shipped with `lines: []` for weeks. A receipt showing only a
		// total is the one a customer replies to asking what they paid for.
		const mail = orderConfirmationEmail({
			brand,
			orderNumber: "ORD-0007",
			lines: [
				{ name: "Alberta ammolite", quantity: 2, unitAmount: 4_500 },
				{ name: "Gift box", quantity: 1, unitAmount: 500 },
			],
			subtotal: 9_500,
			total: 9_500,
			currency: "CAD",
		});
		expect(mail.html).toContain("Alberta ammolite");
		expect(mail.html).toContain("Gift box");
		// Quantity times unit price, not the unit price.
		expect(mail.html).toContain("$90.00");
		expect(mail.text).toContain("Alberta ammolite x2");
	});
});

describe("invoice sent", () => {
	const lines = [{ name: "Consulting", quantity: 3, unitAmount: 10_000 }];

	it("carries the amount due and the line items", () => {
		const mail = invoiceSentEmail({
			brand,
			invoiceNumber: "INV-0012",
			lines,
			subtotal: 30_000,
			tax: 1_500,
			total: 31_500,
			currency: "CAD",
		});
		expect(mail.subject).toContain("INV-0012");
		expect(mail.html).toContain("Consulting");
		expect(mail.html).toContain("$315.00");
		expect(mail.html).toContain("$15.00");
	});

	it("omits a tax row when there is no tax", () => {
		// A "$0.00 tax" line on an invoice that never had tax reads as a bug.
		const mail = invoiceSentEmail({
			brand,
			invoiceNumber: "INV-0013",
			lines,
			subtotal: 30_000,
			tax: 0,
			total: 30_000,
			currency: "CAD",
		});
		expect(mail.html).not.toContain("Tax");
	});

	it("still says nothing about QuickEngine", () => {
		const mail = invoiceSentEmail({
			brand,
			invoiceNumber: "INV-0014",
			lines,
			subtotal: 30_000,
			total: 30_000,
			currency: "CAD",
		});
		for (const forbidden of ["quickengine", "quickdash", "powered by"]) {
			expect(mail.html.toLowerCase()).not.toContain(forbidden);
			expect(mail.text.toLowerCase()).not.toContain(forbidden);
		}
	});
});
