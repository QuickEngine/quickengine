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
	/**
	 * Sales tax as BASIS POINTS — 500 is 5%, 1300 is 13%.
	 *
	 * Not a percentage float: 5% must be exactly 500, and money arithmetic stays
	 * in integers end to end. Capped at 100% because anything above it is a typo
	 * that would otherwise double a customer's bill.
	 *
	 * ⚠️ A single flat rate is correct for a business selling inside one
	 * jurisdiction and wrong for one selling across several. It is the starting
	 * implementation behind `TaxCalculator` (`./tax.ts`), not the final answer.
	 */
	taxRateBasisPoints: z.number().int().min(0).max(10_000).default(0),
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
	firstActions: [
		{
			id: "orders:create",
			version: 1,
			label: "Create your first order",
			description: "Record what a client ordered from your catalog.",
			moduleId: "orders",
			intent: "create",
			priority: 30,
			requires: ["client-records:create", "products-services:create"],
			steps: [
				{
					id: "orders:create:draft",
					version: 1,
					label: "Create the order",
					description: "Choose the client and add what they ordered.",
					intent: "create",
				},
				{
					id: "orders:create:confirm",
					version: 1,
					label: "Confirm the order",
					description: "Review the order and move it into processing.",
					intent: "confirm",
				},
			],
		},
	] as const,
} as const;
