import { describe, expect, it } from "vitest";
import {
	invoiceLineFromQuoteEstimateLine,
	orderLineFromQuoteEstimateLine,
} from "./conversion-lines";
import { quotesEstimatesModule, quotesEstimatesSettingsSchema } from "./module";
import {
	normalizeQuoteQuantity,
	quoteAcceptanceInputSchema,
	quoteEstimateInputSchema,
	quoteEstimateLineInputSchema,
} from "./quote";
import {
	canConvertQuoteEstimate,
	canReviseQuoteEstimate,
	canTransitionQuoteEstimate,
	isQuoteEstimateEditable,
	QUOTE_ESTIMATE_STATUSES,
} from "./status";
import {
	computeQuoteTotals,
	formatQuoteNumber,
	quoteLineTotalCents,
} from "./totals";

const clientId = "00000000-0000-4000-8000-000000000001";
const catalogItemId = "00000000-0000-4000-8000-000000000002";
const catalogItemVariantId = "00000000-0000-4000-8000-000000000003";

function quote(overrides: Record<string, unknown> = {}) {
	return {
		clientId,
		title: "Website redesign",
		lines: [
			{
				name: "Design and implementation",
				quantity: 1,
				unitPriceCents: 250_000,
			},
		],
		...overrides,
	};
}

function storedLine(
	overrides: Partial<
		Parameters<typeof invoiceLineFromQuoteEstimateLine>[number]
	> = {},
): Parameters<typeof invoiceLineFromQuoteEstimateLine>[number] {
	return {
		id: "00000000-0000-4000-8000-000000000004",
		catalogItemId: null,
		catalogItemVariantId: null,
		variantOptions: [],
		name: "Consulting",
		description: null,
		itemType: "service",
		sku: null,
		quantity: "2.000",
		unitLabel: "hours",
		unitPriceCents: 8_000,
		lineTotalCents: 16_000,
		position: 0,
		metadata: {},
		...overrides,
	};
}

describe("Quotes & Estimates module", () => {
	it("is shared, unmetered, and anchored to Client Records", () => {
		expect(quotesEstimatesModule).toMatchObject({
			id: "quotes-estimates",
			kind: "shared",
			dependsOn: ["client-records"],
			meteredAction: null,
		});
	});

	it("uses distinct document prefixes and practical defaults", () => {
		expect(quotesEstimatesSettingsSchema.parse({})).toEqual({
			quoteNumberPrefix: "QTE",
			estimateNumberPrefix: "EST",
			proposalNumberPrefix: "PRO",
			defaultCurrency: "USD",
			defaultValidityDays: 30,
		});
	});
});

describe("quote quantities and totals", () => {
	it("normalizes whole and fractional quantities without float money math", () => {
		expect(normalizeQuoteQuantity(" 2.500 ")).toBe("2.5");
		expect(normalizeQuoteQuantity(3)).toBe("3");
		expect(
			quoteLineTotalCents({ quantity: "1.25", unitPriceCents: 8_000 }),
		).toBe(10_000);
	});

	it("rounds a fractional half-cent deterministically", () => {
		expect(
			quoteLineTotalCents({ quantity: "0.005", unitPriceCents: 100 }),
		).toBe(1);
	});

	it("rejects zero, negative, and over-precise quantities", () => {
		for (const quantity of [0, -1, "0.000", "1.0001", "1e2"]) {
			expect(() =>
				quoteEstimateLineInputSchema.parse({
					name: "Work",
					quantity,
					unitPriceCents: 100,
				}),
			).toThrow();
		}
	});

	it("computes subtotal, explicit tax, and total in integer cents", () => {
		expect(
			computeQuoteTotals(
				[
					{ quantity: "2.5", unitPriceCents: 10_000 },
					{ quantity: "3", unitPriceCents: 500 },
				],
				2_120,
			),
		).toEqual({ subtotalCents: 26_500, taxCents: 2_120, totalCents: 28_620 });
	});
});

describe("quote document contract", () => {
	it("supports quotes, estimates, and proposals with arbitrary service lines", () => {
		expect(
			quoteEstimateInputSchema.parse(
				quote({
					kind: "proposal",
					currency: " cad ",
					validUntil: "2026-08-31",
				}),
			),
		).toMatchObject({
			kind: "proposal",
			currency: "CAD",
			validUntil: "2026-08-31",
		});
	});

	it("allows catalog and variant references but keeps line snapshots", () => {
		expect(
			quoteEstimateLineInputSchema.parse({
				catalogItemId,
				catalogItemVariantId,
				name: "Business cards — matte / 500",
				itemType: "physical",
				sku: " CARDS-500-MATTE ",
				quantity: 2,
				unitPriceCents: 4_500,
			}),
		).toMatchObject({
			catalogItemId,
			catalogItemVariantId,
			name: "Business cards — matte / 500",
			sku: "CARDS-500-MATTE",
		});
	});

	it("requires the variant parent and a real calendar expiry date", () => {
		expect(() =>
			quoteEstimateLineInputSchema.parse({
				catalogItemVariantId,
				name: "Orphaned variant",
				quantity: 1,
				unitPriceCents: 100,
			}),
		).toThrow();
		expect(() =>
			quoteEstimateInputSchema.parse(quote({ validUntil: "2026-02-30" })),
		).toThrow();
	});

	it("captures a named client acceptance without pretending it is an e-signature", () => {
		expect(
			quoteAcceptanceInputSchema.parse({
				acceptedByName: " Ada Lovelace ",
				acceptedByEmail: "ada@example.com",
			}),
		).toMatchObject({ acceptedByName: "Ada Lovelace" });
	});
});

describe("quote lifecycle and revisions", () => {
	it("supports send, client decision, expiry, and accepted conversion", () => {
		expect(canTransitionQuoteEstimate("draft", "sent")).toBe(true);
		expect(canTransitionQuoteEstimate("sent", "accepted")).toBe(true);
		expect(canTransitionQuoteEstimate("sent", "declined")).toBe(true);
		expect(canTransitionQuoteEstimate("sent", "expired")).toBe(true);
		expect(canTransitionQuoteEstimate("accepted", "converted")).toBe(true);
	});

	it("edits drafts and revises already-presented documents as new history", () => {
		expect(isQuoteEstimateEditable("draft")).toBe(true);
		expect(isQuoteEstimateEditable("sent")).toBe(false);
		for (const status of ["sent", "accepted", "declined", "expired"] as const) {
			expect(canReviseQuoteEstimate(status)).toBe(true);
			expect(canTransitionQuoteEstimate(status, "superseded")).toBe(true);
		}
	});

	it("converts only accepted documents and keeps terminal history terminal", () => {
		expect(canConvertQuoteEstimate("accepted")).toBe(true);
		expect(canConvertQuoteEstimate("sent")).toBe(false);
		for (const status of QUOTE_ESTIMATE_STATUSES) {
			expect(canTransitionQuoteEstimate(status, status)).toBe(false);
		}
		for (const status of ["superseded", "converted", "voided"] as const) {
			expect(canTransitionQuoteEstimate(status, "draft")).toBe(false);
		}
	});

	it("keeps revisions under one recognizable human number", () => {
		expect(formatQuoteNumber("QTE", 7)).toBe("QTE-0007");
		expect(formatQuoteNumber("QTE", 7, 2)).toBe("QTE-0007-R2");
	});
});

describe("conversion snapshots", () => {
	it("preserves whole quantities when converting to an invoice", () => {
		expect(invoiceLineFromQuoteEstimateLine(storedLine())).toMatchObject({
			description: "Consulting (hours)",
			quantity: 2,
			unitPriceCents: 8_000,
			sourceModule: "quotes-estimates",
		});
	});

	it("flattens fractional invoice amounts without losing the quoted quantity", () => {
		expect(
			invoiceLineFromQuoteEstimateLine(
				storedLine({
					quantity: "1.250",
					lineTotalCents: 10_000,
				}),
			),
		).toMatchObject({
			description: "Consulting (1.25 hours)",
			quantity: 1,
			unitPriceCents: 10_000,
		});
	});

	it("keeps Orders whole-unit only and carries source identity", () => {
		expect(orderLineFromQuoteEstimateLine(storedLine())).toMatchObject({
			quantity: 2,
			lineTotalCents: 16_000,
			metadata: {
				sourceModule: "quotes-estimates",
				sourceRecordId: "00000000-0000-4000-8000-000000000004",
			},
		});
		expect(() =>
			orderLineFromQuoteEstimateLine(storedLine({ quantity: "1.250" })),
		).toThrow("QUOTE_ORDER_REQUIRES_WHOLE_QUANTITIES");
	});
});
