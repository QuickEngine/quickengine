import { z } from "zod";

export const ordersSettingsSchema = z.object({
	numberPrefix: z.string().trim().min(1).max(12).default("ORD"),
	defaultCurrency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	autoConfirm: z.boolean().default(false),
});

export type OrdersSettings = z.infer<typeof ordersSettingsSchema>;

export const ordersModule = {
	id: "orders",
	name: "Orders",
	description:
		"Track what a client ordered from placement through processing and fulfillment.",
	kind: "domain",
	dependsOn: ["client-records", "products-services", "fulfillment"] as const,
	// Recording an order is a business outcome, not infrastructure consumption.
	meteredAction: null,
	settingsSchema: ordersSettingsSchema,
	defaultSettings: ordersSettingsSchema.parse({}),
} as const;
