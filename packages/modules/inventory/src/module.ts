import { z } from "zod";

export const inventorySettingsSchema = z.object({
	defaultLowStockThreshold: z.number().int().nonnegative().default(5),
	allowNegativeStock: z.boolean().default(false),
});

export type InventorySettings = z.infer<typeof inventorySettingsSchema>;

export const inventoryModule = {
	id: "inventory",
	name: "Inventory",
	description:
		"Track available stock for catalog items and their concrete variants.",
	kind: "domain",
	dependsOn: ["products-services"] as const,
	// Stock movement is a business outcome, not infrastructure consumption.
	meteredAction: null,
	settingsSchema: inventorySettingsSchema,
	defaultSettings: inventorySettingsSchema.parse({}),
	firstActions: [
		{
			id: "inventory:adjust",
			version: 1,
			label: "Record your first stock adjustment",
			description: "Set or correct the available stock for a catalog item.",
			moduleId: "inventory",
			intent: "adjust",
			priority: 40,
			requires: ["products-services:create"],
			steps: [
				{
					id: "inventory:adjust:stock",
					version: 1,
					label: "Set the opening stock",
					description:
						"Record the available quantity for a catalog item or variant.",
					intent: "adjust",
				},
			],
		},
	] as const,
} as const;
