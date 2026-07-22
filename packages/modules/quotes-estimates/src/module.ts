import { z } from "zod";

export const quoteEstimateNumberPrefixSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/);

export const quotesEstimatesSettingsSchema = z.object({
	quoteNumberPrefix: quoteEstimateNumberPrefixSchema.default("QTE"),
	estimateNumberPrefix: quoteEstimateNumberPrefixSchema.default("EST"),
	proposalNumberPrefix: quoteEstimateNumberPrefixSchema.default("PRO"),
	defaultCurrency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	defaultValidityDays: z.number().int().min(1).max(365).default(30),
});

export type QuotesEstimatesSettings = z.infer<
	typeof quotesEstimatesSettingsSchema
>;

export const quotesEstimatesModule = {
	id: "quotes-estimates",
	name: "Quotes & Estimates",
	description:
		"Prepare client quotes, estimates, and proposals that can become invoices or orders after acceptance.",
	kind: "shared",
	dependsOn: ["client-records"] as const,
	// Preparing and accepting a quote is a business outcome, not infrastructure use.
	meteredAction: null,
	settingsSchema: quotesEstimatesSettingsSchema,
	defaultSettings: quotesEstimatesSettingsSchema.parse({}),
	firstActions: [
		{
			id: "quotes-estimates:create",
			version: 1,
			label: "Create your first quote",
			description: "Prepare a quote, estimate, or proposal for a client.",
			moduleId: "quotes-estimates",
			intent: "create",
			priority: 20,
			requires: ["client-records:create"],
			steps: [
				{
					id: "quotes-estimates:create:draft",
					version: 1,
					label: "Prepare the quote",
					description:
						"Choose a client and describe the proposed work or items.",
					intent: "create",
				},
				{
					id: "quotes-estimates:create:send",
					version: 1,
					label: "Send the quote",
					description:
						"Review the proposal and send it for the client’s decision.",
					intent: "send",
				},
			],
		},
	] as const,
} as const;
