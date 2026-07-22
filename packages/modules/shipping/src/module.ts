import { z } from "zod";

export const shippingSettingsSchema = z.object({
	defaultOriginCountry: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/)
		.default("US"),
	defaultCarrier: z.string().trim().max(80).nullable().default(null),
	requireTracking: z.boolean().default(false),
});

export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

export const shippingModule = {
	id: "shipping",
	name: "Shipping",
	description: "Ship physical order items in one or more tracked deliveries.",
	kind: "domain",
	dependsOn: ["orders"] as const,
	// Recording delivery is a business outcome. Carrier labels/rates are a separate
	// infrastructure integration and can be metered when that boundary is built.
	meteredAction: null,
	settingsSchema: shippingSettingsSchema,
	defaultSettings: shippingSettingsSchema.parse({}),
	firstActions: [
		{
			id: "shipping:create",
			version: 1,
			label: "Create your first shipment",
			description: "Prepare a tracked delivery for an order.",
			moduleId: "shipping",
			intent: "create",
			priority: 60,
			requires: ["orders:create"],
			steps: [
				{
					id: "shipping:create:shipment",
					version: 1,
					label: "Prepare the shipment",
					description:
						"Choose the order lines, carrier, parcels, and destination.",
					intent: "create",
				},
				{
					id: "shipping:create:dispatch",
					version: 1,
					label: "Mark it shipped",
					description: "Confirm dispatch and add tracking when available.",
					intent: "dispatch",
				},
			],
		},
	] as const,
} as const;
