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
} as const;
