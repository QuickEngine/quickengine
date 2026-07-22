import { z } from "zod";

export const fulfillmentKinds = [
	"physical",
	"digital",
	"service",
	"pickup",
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
	firstActions: [
		{
			id: "fulfillment:create",
			version: 1,
			label: "Start your first fulfillment",
			description:
				"Begin delivering a paid product, file, service, or engagement.",
			moduleId: "fulfillment",
			intent: "create",
			priority: 60,
			requires: ["payments:record"],
			steps: [
				{
					id: "fulfillment:create:start",
					version: 1,
					label: "Start the fulfillment",
					description:
						"Begin delivering the paid product, file, service, or engagement.",
					intent: "create",
				},
				{
					id: "fulfillment:create:complete",
					version: 1,
					label: "Complete the fulfillment",
					description: "Confirm that the promised outcome was delivered.",
					intent: "complete",
				},
			],
		},
	] as const,
} as const;
