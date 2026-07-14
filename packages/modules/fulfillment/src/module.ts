import { z } from "zod";

export const fulfillmentKinds = [
	"physical",
	"digital",
	"service",
	"other",
] as const;

export const fulfillmentSettingsSchema = z.object({
	defaultKind: z.enum(fulfillmentKinds).default("other"),
	completionLabel: z.string().min(1).max(40).default("Delivered"),
});

export type FulfillmentSettings = z.infer<typeof fulfillmentSettingsSchema>;

export const fulfillmentModule = {
	id: "fulfillment",
	name: "Fulfillment",
	description:
		"Deliver what the business promised — a physical product, digital item, service, or completed engagement.",
	kind: "shared",
	// Fulfillment closes the universal business loop after money is collected.
	dependsOn: ["payments"] as const,
	// Delivering the customer's purchase is a business outcome, not metered cost.
	meteredAction: null,
	settingsSchema: fulfillmentSettingsSchema,
	defaultSettings: fulfillmentSettingsSchema.parse({}),
} as const;
