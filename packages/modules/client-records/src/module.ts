import { z } from "zod";

// What a workspace can configure when it enables Client Records. Every module
// defines its own settings schema (Development Standards §5).
export const clientRecordsSettingsSchema = z.object({
	// What this workspace calls a record — Customer / Client / Student / …
	recordLabelSingular: z.string().trim().min(1).max(40).default("Customer"),
	recordLabelPlural: z.string().trim().min(1).max(40).default("Customers"),
	// Optional fields to surface on the record form.
	fields: z
		.object({
			phone: z.boolean().default(true),
			company: z.boolean().default(true),
			notes: z.boolean().default(true),
		})
		.default({ phone: true, company: true, notes: true }),
});

export type ClientRecordsSettings = z.infer<typeof clientRecordsSettingsSchema>;

// The module manifest — its identity, its configurable settings, and what counts
// as one metered "action". QuickDash, onboarding, and the metering engine read
// this. Every module exports one of these in the same shape.
export const clientRecordsModule = {
	id: "client-records",
	name: "Client Records",
	description:
		"A shared record of the people and organizations your business deals with — customers, clients, students, whatever fits.",
	// Shared modules are available on every workspace regardless of business type.
	kind: "shared",
	// Foundation module — depends on nothing; other modules depend on it.
	dependsOn: [] as const,
	// Not metered. Storing a contact isn't a billable action (you don't pay to have
	// customers). A free-tier count cap is the only lever, enforced at the plan layer.
	meteredAction: null,
	settingsSchema: clientRecordsSettingsSchema,
	defaultSettings: clientRecordsSettingsSchema.parse({}),
	firstActions: [
		{
			id: "client-records:create",
			version: 1,
			label: "Add your first client",
			description: "Create the first person or business you work with.",
			moduleId: "client-records",
			intent: "create",
			priority: 10,
		},
	] as const,
} as const;
