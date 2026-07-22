import { z } from "zod";

// What a workspace can configure for Payments. Note what's NOT here: the platform
// fee. Our optional share is set at the plan layer (revenue policy), never something
// a workspace dials in for itself.
export const paymentsSettingsSchema = z.object({
	// ISO 4217 currency the workspace collects in by default.
	defaultCurrency: z.string().length(3).default("USD"),
	// Text shown on the customer's card statement (Stripe caps this at 22 chars).
	statementDescriptor: z.string().max(22).optional(),
});

export type PaymentsSettings = z.infer<typeof paymentsSettingsSchema>;

// The Payments module manifest. Depends on Invoicing — a payment settles an invoice,
// and on success it reconciles the invoice to `paid`.
//
// `meteredAction: null` — getting paid is not billable infrastructure and is never
// metered against the `actions` engine. QuickEngine's revenue here, if any, is an
// optional Stripe *application fee* on money it actually processed (default 0), which
// is money movement, not a usage meter. You never pay to receive your own money.
export const paymentsModule = {
	id: "payments",
	name: "Payments",
	description:
		"Collect money from your clients via your own connected Stripe account — settle invoices and get paid out directly.",
	kind: "shared",
	dependsOn: ["invoicing"] as const,
	meteredAction: null,
	settingsSchema: paymentsSettingsSchema,
	defaultSettings: paymentsSettingsSchema.parse({}),
	firstActions: [
		{
			id: "payments:record",
			version: 1,
			label: "Record your first payment",
			description: "Record money received against an invoice.",
			moduleId: "payments",
			intent: "create",
			priority: 50,
			requires: ["invoicing:create"],
		},
	] as const,
} as const;
