import { z } from "zod";

// What a workspace can configure when it enables Invoicing.
export const invoicingSettingsSchema = z.object({
	// Prefix for generated invoice numbers: INV-0001, ACME-0001, …
	numberPrefix: z.string().min(1).max(12).default("INV"),
	// ISO 4217 currency the workspace bills in by default.
	defaultCurrency: z.string().length(3).default("USD"),
	// Default payment window, in days, applied to a new invoice's due date.
	defaultDueInDays: z.number().int().min(0).max(365).default(30),
});

export type InvoicingSettings = z.infer<typeof invoicingSettingsSchema>;

// The module manifest. New primitive here vs. Client Records: `dependsOn` — the
// modules this one composes on. Invoicing points an invoice at a client record, so
// it requires Client Records to be enabled in the workspace. Onboarding reads this
// to enforce the graph (can't enable Invoicing without its dependency).
//
// `meteredAction: null` — deliberately. Creating or sending an invoice is a
// business outcome, not infrastructure we pay for, so we don't meter it. Metering
// is reserved for actions that cost QuickEngine real resources (conversions, heavy
// jobs). Tier limits (e.g. an entity cap on a free plan) are the right lever for
// business records, and that's decided at the plan layer, not per-create here.
export const invoicingModule = {
	id: "invoicing",
	name: "Invoicing",
	description:
		"Bill your clients — draft, send, and track invoices against the people in Client Records.",
	kind: "shared",
	dependsOn: ["client-records"] as const,
	meteredAction: null,
	settingsSchema: invoicingSettingsSchema,
	defaultSettings: invoicingSettingsSchema.parse({}),
} as const;
