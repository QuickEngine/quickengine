import { describe, expect, it } from "vitest";
import { invoicingModule, invoicingSettingsSchema } from "./module";
import { canTransition, INVOICE_STATUSES } from "./status";
import { computeInvoiceTotals, formatInvoiceNumber } from "./totals";

describe("invoice totals", () => {
	it("sums quantity × unit price across lines with no float drift", () => {
		// 3 × $0.10 + 7 × $0.01 = 30 + 7 = 37 cents. On floats, 0.1*3 + 0.01*7
		// famously mis-rounds; in integer cents it can't.
		const totals = computeInvoiceTotals([
			{ quantity: 3, unitPriceCents: 10 },
			{ quantity: 7, unitPriceCents: 1 },
		]);
		expect(totals.subtotalCents).toBe(37);
		expect(totals.totalCents).toBe(37);
	});

	it("adds tax on top of the subtotal", () => {
		const totals = computeInvoiceTotals(
			[{ quantity: 2, unitPriceCents: 500 }],
			175,
		);
		expect(totals.subtotalCents).toBe(1000);
		expect(totals.taxCents).toBe(175);
		expect(totals.totalCents).toBe(1175);
	});

	it("is zero for an empty invoice", () => {
		expect(computeInvoiceTotals([])).toEqual({
			subtotalCents: 0,
			taxCents: 0,
			totalCents: 0,
		});
	});

	it("handles a large invoice without losing precision", () => {
		const lines = Array.from({ length: 1000 }, () => ({
			quantity: 3,
			unitPriceCents: 999,
		}));
		expect(computeInvoiceTotals(lines).subtotalCents).toBe(1000 * 3 * 999);
	});
});

describe("invoice number formatting", () => {
	it("zero-pads the sequence", () => {
		expect(formatInvoiceNumber("INV", 7)).toBe("INV-0007");
	});
	it("does not truncate past the pad width", () => {
		expect(formatInvoiceNumber("ACME", 12345)).toBe("ACME-12345");
	});
});

describe("invoice status machine", () => {
	it("allows the happy path draft → sent → paid", () => {
		expect(canTransition("draft", "sent")).toBe(true);
		expect(canTransition("sent", "paid")).toBe(true);
	});

	it("allows a draft to be paid directly (payment-link settlement)", () => {
		expect(canTransition("draft", "paid")).toBe(true);
	});

	it("allows voiding anything not yet paid", () => {
		expect(canTransition("draft", "void")).toBe(true);
		expect(canTransition("sent", "void")).toBe(true);
	});

	it("rejects illegal jumps", () => {
		expect(canTransition("paid", "draft")).toBe(false); // paid is terminal
		expect(canTransition("paid", "void")).toBe(false); // can't void a paid invoice
		expect(canTransition("void", "sent")).toBe(false); // void is terminal
	});

	it("has no self-loops in the transition table", () => {
		for (const status of INVOICE_STATUSES) {
			expect(canTransition(status, status)).toBe(false);
		}
	});
});

describe("invoicing settings", () => {
	it("applies sensible defaults", () => {
		const settings = invoicingSettingsSchema.parse({});
		expect(settings.numberPrefix).toBe("INV");
		expect(settings.defaultCurrency).toBe("USD");
		expect(settings.defaultDueInDays).toBe(30);
	});

	it("rejects a currency that isn't a 3-letter code", () => {
		expect(() =>
			invoicingSettingsSchema.parse({ defaultCurrency: "US" }),
		).toThrow();
		expect(() =>
			invoicingSettingsSchema.parse({ defaultCurrency: "DOLLARS" }),
		).toThrow();
	});

	it("rejects a negative payment window", () => {
		expect(() =>
			invoicingSettingsSchema.parse({ defaultDueInDays: -1 }),
		).toThrow();
	});
});

describe("invoicing manifest", () => {
	it("declares its dependency on Client Records", () => {
		expect(invoicingModule.dependsOn).toContain("client-records");
	});

	it("does not meter invoice creation (business outcome, not billable)", () => {
		expect(invoicingModule.meteredAction).toBeNull();
	});

	it("exposes a stable identity", () => {
		expect(invoicingModule.id).toBe("invoicing");
		expect(invoicingModule.kind).toBe("shared");
	});
});
